import type { ApiDependencies } from './dependencies'
import { ApiException } from './errors'
import { createAuthHandlers } from './modules/auth'
import { createCategoryHandlers } from './modules/categories'
import { createItemHandlers } from './modules/items'
import { createLabelHandlers } from './modules/labels'
import { createMembershipHandlers } from './modules/membership'
import { createOutboundHandlers } from './modules/outbound'
import { createStorageHandlers } from './modules/storage'
import { systemHandlers } from './modules/system'
import type {
  ApiEvent,
  ApiHandler,
  ApiResponse,
  RequestContext,
} from './types'

export type ApiRouter = (
  event: ApiEvent,
  context: RequestContext,
) => Promise<ApiResponse>

export function createRouter(deps: ApiDependencies): ApiRouter {
  const handlers: Readonly<
    Record<string, Readonly<Record<string, ApiHandler>>>
  > = {
    auth: createAuthHandlers(deps),
    categories: createCategoryHandlers(deps),
    items: createItemHandlers(deps),
    labels: createLabelHandlers(deps),
    membership: createMembershipHandlers(deps),
    outbound: createOutboundHandlers(deps),
    storage: createStorageHandlers(deps),
    system: systemHandlers,
  }

  return async function route(
    event: ApiEvent,
    context: RequestContext,
  ): Promise<ApiResponse> {
    try {
      if (typeof event.module !== 'string' || typeof event.action !== 'string') {
        throw new ApiException('INVALID_REQUEST', 'module 和 action 必须是字符串')
      }

      const handler = handlers[event.module]?.[event.action]
      if (!handler) {
        throw new ApiException(
          'NOT_IMPLEMENTED',
          `${event.module}.${event.action} 尚未实现`,
        )
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
}
