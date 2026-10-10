import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'

import { ApiException } from '../../../cloudfunctions/api/src/errors'
import type { ApiRouter } from '../../../cloudfunctions/api/src/router'
import type {
  ApiEvent,
  RequestContext,
} from '../../../cloudfunctions/api/src/types'
import { PayloadTooLargeError, readJsonBody } from './body'
import { clientIp, RateLimiter } from './rate-limit'
import { sendApiError, sendApiResponse, sendJson } from './respond'

export type HttpHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
) => Promise<void>

export interface HttpRoute {
  readonly method: string
  readonly match: (pathname: string) => boolean
  readonly handle: HttpHandler
}

export interface HttpRateLimits {
  readonly authSessionPerMinute?: number
  readonly apiPerMinute?: number
  /** 额外端点限额：key 为 pathname，value 为每分钟单 IP 上限。 */
  readonly extra?: Readonly<Record<string, number>>
}

export interface HttpApiOptions {
  readonly route: ApiRouter
  readonly authenticate: (request: IncomingMessage) => Promise<RequestContext>
  readonly checkHealth: () => Promise<void>
  readonly routes?: readonly HttpRoute[]
  readonly maxBodyBytes?: number
  // 敏感端点的每分钟单 IP 限额；默认关闭，生产装配处显式开启
  readonly rateLimits?: HttpRateLimits
}

const defaultMaxBodyBytes = 1024 * 1024

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function handleHealth(
  options: HttpApiOptions,
  response: ServerResponse,
): Promise<void> {
  try {
    await options.checkHealth()
  } catch (error) {
    console.error(error)
    sendJson(response, 503, {
      ok: false,
      error: { code: 'SERVICE_UNAVAILABLE', message: '依赖服务不可用' },
    })
    return
  }
  sendJson(response, 200, { ok: true, data: { status: 'ok' } })
}

async function handleApi(
  options: HttpApiOptions,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  let context: RequestContext
  try {
    context = await options.authenticate(request)
  } catch (error) {
    if (!(error instanceof ApiException)) {
      throw error
    }
    sendApiError(response, error.code, error.message, error.details)
    return
  }

  let event: unknown
  try {
    event = await readJsonBody(request, options.maxBodyBytes ?? defaultMaxBodyBytes)
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      sendApiError(response, 'PAYLOAD_TOO_LARGE', error.message)
      return
    }
    sendApiError(response, 'INVALID_REQUEST', '请求体不是合法的 JSON')
    return
  }

  if (!isPlainObject(event)) {
    sendApiError(response, 'INVALID_REQUEST', '请求体必须是 JSON 对象')
    return
  }

  sendApiResponse(response, await options.route(event as ApiEvent, context))
}

async function dispatch(
  options: HttpApiOptions,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const method = request.method ?? 'GET'

  if (url.pathname === '/health' && method === 'GET') {
    await handleHealth(options, response)
    return
  }

  if (url.pathname === '/api' && method === 'POST') {
    await handleApi(options, request, response)
    return
  }

  for (const route of options.routes ?? []) {
    if (route.method === method && route.match(url.pathname)) {
      await route.handle(request, response, url)
      return
    }
  }

  sendApiError(response, 'NOT_IMPLEMENTED', '接口不存在')
}

export function createApiRequestListener(
  options: HttpApiOptions,
): (request: IncomingMessage, response: ServerResponse) => void {
  const authSessionLimiter =
    options.rateLimits?.authSessionPerMinute === undefined
      ? null
      : new RateLimiter(options.rateLimits.authSessionPerMinute, 60_000)
  const apiLimiter =
    options.rateLimits?.apiPerMinute === undefined
      ? null
      : new RateLimiter(options.rateLimits.apiPerMinute, 60_000)
  const extraLimiters = new Map<string, RateLimiter>()
  for (const [path, perMinute] of Object.entries(
    options.rateLimits?.extra ?? {},
  )) {
    extraLimiters.set(path, new RateLimiter(perMinute, 60_000))
  }
  return (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    const isPost = request.method === 'POST'
    const limiter =
      (isPost ? extraLimiters.get(pathname) : undefined) ??
      (isPost && pathname === '/auth/session'
        ? authSessionLimiter
        : isPost && pathname === '/api'
          ? apiLimiter
          : null)
    if (limiter !== null && !limiter.tryAcquire(clientIp(request))) {
      sendApiError(response, 'RATE_LIMITED', '请求过于频繁，请稍后再试')
      return
    }
    dispatch(options, request, response).catch((error: unknown) => {
      console.error(error)
      if (response.headersSent) {
        response.destroy()
        return
      }
      sendJson(response, 500, {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: '服务端发生未预期错误' },
      })
    })
  }
}

export function createHttpApi(options: HttpApiOptions): Server {
  return createServer(createApiRequestListener(options))
}
