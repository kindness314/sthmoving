import type { ServerResponse } from 'node:http'

import type { ApiResponse } from '../../../cloudfunctions/api/src/types'

const statusByErrorCode: Readonly<Record<string, number>> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  INVALID_REQUEST: 400,
  PAYLOAD_TOO_LARGE: 413,
  NOT_FOUND: 404,
  NOT_IMPLEMENTED: 404,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
}

export function statusForErrorCode(code: string): number {
  return statusByErrorCode[code] ?? 200
}

export function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = Buffer.from(JSON.stringify(body), 'utf8')
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.length,
  })
  response.end(payload)
}

export function sendApiResponse(
  response: ServerResponse,
  result: ApiResponse,
): void {
  sendJson(
    response,
    result.ok ? 200 : statusForErrorCode(result.error.code),
    result,
  )
}

export function sendApiError(
  response: ServerResponse,
  code: string,
  message: string,
  details?: unknown,
): void {
  sendApiResponse(response, {
    ok: false,
    error: details === undefined ? { code, message } : { code, message, details },
  })
}
