import type { IncomingMessage } from 'node:http'

import { ApiException } from '../../../cloudfunctions/api/src/errors'
import { deriveUserId } from '../../../cloudfunctions/api/src/identity'
import type { MembershipRepository } from '../../../cloudfunctions/api/src/membership/repository'
import { MembershipService } from '../../../cloudfunctions/api/src/membership/service'
import type { RequestContext } from '../../../cloudfunctions/api/src/types'
import { readJsonBody } from '../http/body'
import { sendApiError, sendApiResponse } from '../http/respond'
import type { HttpRoute } from '../http/server'
import type { SessionStore } from './sessions'
import type { WeChatAuthClient } from './wechat'

const maxSessionBodyBytes = 1024
const bearerPrefix = 'Bearer '

export function createBearerAuthenticator(
  sessions: SessionStore,
): (request: IncomingMessage) => Promise<RequestContext> {
  return async (request) => {
    const header = request.headers.authorization
    if (typeof header !== 'string' || !header.startsWith(bearerPrefix)) {
      throw new ApiException('UNAUTHENTICATED', '缺少访问令牌')
    }
    const identity = await sessions.verify(header.slice(bearerPrefix.length).trim())
    if (!identity) {
      throw new ApiException('UNAUTHENTICATED', '访问令牌无效或已过期')
    }
    return identity
  }
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
