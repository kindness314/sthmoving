import type {
  ApiError,
  ApiRequest,
  ApiResponse,
} from '../types/api'

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

export async function callApi<TPayload, TData>(
  request: ApiRequest<TPayload>,
): Promise<TData> {
  const result = await wx.cloud.callFunction({
    name: 'api',
    data: request,
  })
  const response = result.result as ApiResponse<TData>
  if (!response.ok) {
    throw createApiClientError(response.error)
  }
  return response.data
}
