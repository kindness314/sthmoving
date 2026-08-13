import { apiBaseUrl } from '../config/env'
import type {
  ApiError,
  ApiRequest,
  ApiResponse,
} from '../types/api'
import type { UploadPurpose, UploadTicket } from './file-upload'
import type { StoredSession } from './session'
import { createStorageSessionDependencies, SessionManager } from './session'

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: unknown,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

export function createApiClientError(error: ApiError): ApiClientError {
  return new ApiClientError(error.code, error.message, error.details)
}

interface HttpResult {
  statusCode: number
  data: unknown
}

function httpRequest(options: {
  path: string
  data: unknown
  token?: string
}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${apiBaseUrl}${options.path}`,
      method: 'POST',
      header: {
        'content-type': 'application/json',
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      data: options.data as WechatMiniprogram.IAnyObject,
      success: ({ statusCode, data }) => resolve({ statusCode, data }),
      fail: (error) => reject(new Error(error.errMsg || '网络请求失败')),
    })
  })
}

function unwrap<TData>(result: HttpResult): TData {
  const response = result.data as ApiResponse<TData> | undefined
  if (typeof response !== 'object' || response === null) {
    throw new ApiClientError(
      'INVALID_RESPONSE',
      '服务端返回了无法解析的内容',
      result.statusCode,
    )
  }
  if (!response.ok) {
    throw createApiClientError(response.error)
  }
  return response.data
}

async function acquireSession(): Promise<StoredSession> {
  const { code } = await wx.login()
  const issued = unwrap<{ token: string; expiresAt: string }>(
    await httpRequest({ path: '/auth/session', data: { code } }),
  )
  return {
    token: issued.token,
    expiresAt: Date.parse(issued.expiresAt),
  }
}

export const session = new SessionManager(
  createStorageSessionDependencies(acquireSession),
)

async function sendAuthorized<TData>(
  path: string,
  data: unknown,
): Promise<TData> {
  let result = await httpRequest({
    path,
    data,
    token: await session.getToken(),
  })
  if (result.statusCode === 401) {
    session.invalidate()
    result = await httpRequest({
      path,
      data,
      token: await session.getToken(),
    })
  }
  return unwrap<TData>(result)
}

export function callApi<TPayload, TData>(
  request: ApiRequest<TPayload>,
): Promise<TData> {
  return sendAuthorized<TData>('/api', request)
}

export function requestUploadTicket(
  purpose: UploadPurpose,
  contentType: string,
): Promise<UploadTicket> {
  return sendAuthorized<UploadTicket>('/files/uploads', {
    purpose,
    contentType,
  })
}

export function resolveFileUrls(
  fileIds: readonly string[],
): Promise<Record<string, string>> {
  return callApi<{ fileIds: string[] }, Record<string, string>>({
    module: 'storage',
    action: 'resolve',
    payload: { fileIds: [...fileIds] },
  })
}

export function discardFiles(
  fileIds: readonly string[],
): Promise<{ discarded: number }> {
  return callApi<{ fileIds: string[] }, { discarded: number }>({
    module: 'storage',
    action: 'discard',
    payload: { fileIds: [...fileIds] },
  })
}
