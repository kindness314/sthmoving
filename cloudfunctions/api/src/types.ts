export interface ApiEvent {
  module?: unknown
  action?: unknown
  payload?: unknown
}

/** 数据域：生产为 'prod'，审核沙箱为 'test'。 */
export type ApiRealm = 'prod' | 'test'

export interface RequestContext {
  userId: string
  openid: string
  /** 缺省视为生产域（云函数与既有调用方不传）。 */
  realm?: ApiRealm
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
