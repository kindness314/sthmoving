import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'

import { ApiException } from '../../../cloudfunctions/api/src/errors'
import type { ApiRouter } from '../../../cloudfunctions/api/src/router'
import type {
  ApiEvent,
  RequestContext,
} from '../../../cloudfunctions/api/src/types'
import { PayloadTooLargeError, readJsonBody } from './body'
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

export interface HttpApiOptions {
  readonly route: ApiRouter
  readonly authenticate: (request: IncomingMessage) => Promise<RequestContext>
  readonly checkHealth: () => Promise<void>
  readonly routes?: readonly HttpRoute[]
  readonly maxBodyBytes?: number
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
  return (request, response) => {
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
