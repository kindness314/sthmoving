export interface ApiRequest<TPayload = Record<string, never>> {
  module: string
  action: string
  payload: TPayload
}

export interface ApiError {
  code: string
  message: string
  details?: unknown
}

export type ApiResponse<TData> =
  | { ok: true; data: TData }
  | { ok: false; error: ApiError }
