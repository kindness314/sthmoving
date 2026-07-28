export interface ApiEvent {
  module?: unknown
  action?: unknown
  payload?: unknown
}

export interface RequestContext {
  openid: string
}

export interface ApiError {
  code: string
  message: string
  details?: unknown
}

export type ApiResponse<TData = unknown> =
  | { ok: true; data: TData }
  | { ok: false; error: ApiError }

export type ApiHandler = (
  payload: unknown,
  context: RequestContext,
) => Promise<unknown>
