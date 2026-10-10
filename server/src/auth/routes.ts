import type { IncomingMessage } from 'node:http'

import { ApiException } from '../../../cloudfunctions/api/src/errors'
import { deriveUserId } from '../../../cloudfunctions/api/src/identity'
import type { MembershipRepository } from '../../../cloudfunctions/api/src/membership/repository'
import { MembershipService } from '../../../cloudfunctions/api/src/membership/service'
import type { RequestContext } from '../../../cloudfunctions/api/src/types'
import { readJsonBody } from '../http/body'
import { sendApiError, sendApiResponse } from '../http/respond'
import type { HttpRoute } from '../http/server'
import type { TestAccessControl } from '../review/access'
import type { TestSessionService } from '../review/test-session'
import type { SessionStore } from './sessions'
import type { WeChatAuthClient } from './wechat'

const maxSessionBodyBytes = 1024
const bearerPrefix = 'Bearer '

export const testSessionTokenPrefix = 't1_'

export interface RealmSessionOptions {
  readonly prod: SessionStore
  /** 未配置沙箱库时为空，此时不识别测试令牌。 */
  readonly test?: SessionStore
  readonly testPrefix: string
}

/** 按令牌前缀判定数据域：测试令牌只在沙箱库校验，其余走生产库。 */
export function createRealmAuthenticator(
  options: RealmSessionOptions,
): (request: IncomingMessage) => Promise<RequestContext> {
  return async (request) => {
    const header = request.headers.authorization
    if (typeof header !== 'string' || !header.startsWith(bearerPrefix)) {
      throw new ApiException('UNAUTHENTICATED', '缺少访问令牌')
    }
    const token = header.slice(bearerPrefix.length).trim()
    if (options.test && token.startsWith(options.testPrefix)) {
      const identity = await options.test.verify(token)
      if (identity) {
        return { ...identity, realm: 'test' }
      }
      // 前缀与随机串碰撞的概率极低，未命中时继续按生产域校验
    }
    const identity = await options.prod.verify(token)
    if (!identity) {
      throw new ApiException('UNAUTHENTICATED', '访问令牌无效或已过期')
    }
    return identity
  }
}

export function createBearerAuthenticator(
  sessions: SessionStore,
): (request: IncomingMessage) => Promise<RequestContext> {
  return createRealmAuthenticator({
    prod: sessions,
    testPrefix: testSessionTokenPrefix,
  })
}

export interface SessionRouteOptions {
  readonly sessions: SessionStore
  readonly wechat: WeChatAuthClient
  readonly membership: MembershipRepository
}

export function createSessionRoute(options: SessionRouteOptions): HttpRoute {
  return {
    method: 'POST',
    match: (pathname) => pathname === '/auth/session',
    handle: async (request, response) => {
      let body: unknown
      try {
        body = await readJsonBody(request, maxSessionBodyBytes)
      } catch {
        sendApiError(response, 'INVALID_REQUEST', '登录请求体无效')
        return
      }

      const code = (body as { code?: unknown } | null)?.code
      if (typeof code !== 'string' || code.length === 0) {
        sendApiError(response, 'INVALID_REQUEST', '缺少微信登录凭证')
        return
      }

      try {
        const openid = await options.wechat.codeToOpenid(code)
        const userId = deriveUserId(openid)
        const session = await new MembershipService(options.membership).login(
          userId,
          openid,
        )
        const issued = await options.sessions.issue(userId)
        sendApiResponse(response, {
          ok: true,
          data: { ...issued, session },
        })
      } catch (error) {
        if (!(error instanceof ApiException)) {
          throw error
        }
        sendApiError(response, error.code, error.message, error.details)
      }
    },
  }
}

const maxTestSessionBodyBytes = 1024

export interface TestSessionRouteOptions {
  readonly service: TestSessionService
}

export function createTestSessionRoute(
  options: TestSessionRouteOptions,
): HttpRoute {
  return {
    method: 'POST',
    match: (pathname) => pathname === '/auth/test-session',
    handle: async (request, response) => {
      let body: unknown
      try {
        body = await readJsonBody(request, maxTestSessionBodyBytes)
      } catch {
        sendApiError(response, 'INVALID_REQUEST', '测试登录请求体无效')
        return
      }

      const password = (body as { password?: unknown } | null)?.password
      if (typeof password !== 'string' || password.trim() === '') {
        sendApiError(response, 'INVALID_REQUEST', '缺少测试口令')
        return
      }

      try {
        const issued = await options.service.start(password)
        sendApiResponse(response, { ok: true, data: issued })
      } catch (error) {
        if (!(error instanceof ApiException)) {
          throw error
        }
        sendApiError(response, error.code, error.message, error.details)
      }
    },
  }
}

export interface TestAccessStatusRouteOptions {
  readonly access: TestAccessControl
  /** 沙箱库是否可用：不可用时入口一律视为关闭。 */
  readonly available: () => Promise<boolean>
}

/** 公开端点：登录页据此决定是否渲染测试入口。 */
export function createTestAccessStatusRoute(
  options: TestAccessStatusRouteOptions,
): HttpRoute {
  return {
    method: 'POST',
    match: (pathname) => pathname === '/auth/test-access',
    handle: async (_request, response) => {
      let enabled = false
      try {
        enabled =
          (await options.available()) && (await options.access.active()) !== null
      } catch (error) {
        console.error(error)
      }
      sendApiResponse(response, { ok: true, data: { enabled } })
    },
  }
}

export interface LogoutRouteOptions {
  readonly prod: SessionStore
  readonly test?: SessionStore
  readonly testPrefix: string
}

export function createLogoutRoute(options: LogoutRouteOptions): HttpRoute {
  return {
    method: 'POST',
    match: (pathname) => pathname === '/auth/logout',
    handle: async (request, response) => {
      const header = request.headers.authorization
      const token =
        typeof header === 'string' && header.startsWith(bearerPrefix)
          ? header.slice(bearerPrefix.length).trim()
          : ''
      if (token !== '') {
        const store =
          options.test && token.startsWith(options.testPrefix)
            ? options.test
            : options.prod
        try {
          await store.revoke(token)
        } catch (error) {
          console.error(error)
        }
      }
      sendApiResponse(response, { ok: true, data: { revoked: true } })
    },
  }
}
