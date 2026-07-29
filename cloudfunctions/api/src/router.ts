import { ApiException } from './errors'
import { authHandlers } from './modules/auth'
import { membershipHandlers } from './modules/membership'
import { systemHandlers } from './modules/system'
import type {
  ApiEvent,
  ApiHandler,
  ApiResponse,
  RequestContext,
} from './types'

const plannedModules = new Set([
  'items',
  'categories',
  'outbound',
  'labels',
  'notifications',
])

const handlers: Readonly<Record<string, Readonly<Record<string, ApiHandler>>>> = {
  auth: authHandlers,
  membership: membershipHandlers,
  system: systemHandlers,
}

export async function route(
  event: ApiEvent,
  context: RequestContext,
): Promise<ApiResponse> {
  try {
    if (typeof event.module !== 'string' || typeof event.action !== 'string') {
      throw new ApiException('INVALID_REQUEST', 'module 和 action 必须是字符串')
    }

    const handler = handlers[event.module]?.[event.action]
    if (!handler) {
      const message = plannedModules.has(event.module)
        ? `${event.module}.${event.action} 尚未实现`
        : `未知模块：${event.module}`
      throw new ApiException('NOT_IMPLEMENTED', message)
    }

    return {
      ok: true,
      data: await handler(event.payload, context),
    }
  } catch (error) {
    if (error instanceof ApiException) {
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      }
    }

    console.error(error)
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务端发生未预期错误',
      },
    }
  }
}
