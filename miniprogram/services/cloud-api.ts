import type { ApiRequest, ApiResponse } from '../types/api'

export async function callApi<TPayload, TData>(
  request: ApiRequest<TPayload>,
): Promise<TData> {
  const result = await wx.cloud.callFunction({
    name: 'api',
    data: request,
  })
  const response = result.result as ApiResponse<TData>
  if (!response.ok) {
    throw new Error(`${response.error.code}: ${response.error.message}`)
  }
  return response.data
}
