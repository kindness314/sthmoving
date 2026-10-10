import { ApiException } from '../../../cloudfunctions/api/src/errors'
import type { MembershipRepository } from '../../../cloudfunctions/api/src/membership/repository'
import type {
  ApiEvent,
  ApiHandler,
  ApiResponse,
  RequestContext,
} from '../../../cloudfunctions/api/src/types'
import type { SessionStore } from '../auth/sessions'
import type { TestAccessControl } from './access'
import { formatTestPassword } from './passwords'
import { sandboxUserId } from './sandbox'

export interface ReviewModuleOptions {
  /** 生产库控制面。 */
  readonly access: TestAccessControl
  /** 生产库仓储，用于校验操作者角色。 */
  readonly membership: MembershipRepository
  /** 沙箱域会话存储，关闭入口时一并吊销。 */
  readonly testSessions: SessionStore
  readonly ttlMilliseconds: number
}

/**
 * 测试入口的控制面（仅生产域可用，需要实际管理者或所有者）。
 * 独立于共享路由表，避免给云函数实现增加依赖。
 */
export function createReviewRouter(
  options: ReviewModuleOptions,
): (event: ApiEvent, context: RequestContext) => Promise<ApiResponse> {
  const requireManagerOrOwner = async (
    context: RequestContext,
  ): Promise<void> => {
    if (context.realm === 'test') {
      throw new ApiException(
        'TEST_ACCESS_UNAVAILABLE',
        '沙箱内不提供测试入口管理',
      )
    }
    const actor = await options.membership.runTransaction((unitOfWork) =>
      unitOfWork.getUser(context.userId),
    )
    if (!actor) {
      throw new ApiException('UNAUTHENTICATED', '当前微信用户尚未建立账号')
    }
    if (actor.status !== 'APPROVED') {
      throw new ApiException('ACCOUNT_NOT_ACTIVE', '当前账号尚未通过审核')
    }
    if (actor.role !== 'MANAGER' && actor.role !== 'OWNER') {
      throw new ApiException(
        'FORBIDDEN',
        '只有实际管理者或所有者可以管理测试入口',
      )
    }
  }

  const handlers: Readonly<Record<string, ApiHandler>> = {
    testAccess: async (_payload, context) => {
      await requireManagerOrOwner(context)
      const active = await options.access.active()
      return {
        enabled: active !== null,
        createdAt: active?.createdAt ?? null,
        expiresAt: active?.expiresAt ?? null,
        useCount: active?.useCount ?? 0,
        lastUsedAt: active?.lastUsedAt ?? null,
      }
    },

    enableTestAccess: async (_payload, context) => {
      await requireManagerOrOwner(context)
      const created = await options.access.enable(
        context.userId,
        options.ttlMilliseconds,
      )
      // 轮换口令即轮换信任边界：已签发的沙箱会话一并吊销
      await options.testSessions.revokeUser(sandboxUserId)
      return {
        enabled: true,
        password: formatTestPassword(created.password),
        expiresAt: created.expiresAt,
      }
    },

    disableTestAccess: async (_payload, context) => {
      await requireManagerOrOwner(context)
      await options.access.disable()
      await options.testSessions.revokeUser(sandboxUserId)
      return { enabled: false }
    },
  }

  return async (event, context) => {
    try {
      if (typeof event.action !== 'string') {
        throw new ApiException('INVALID_REQUEST', 'action 必须是字符串')
      }
      const handler = handlers[event.action]
      if (!handler) {
        throw new ApiException(
          'NOT_IMPLEMENTED',
          `review.${event.action} 尚未实现`,
        )
      }
      return { ok: true, data: await handler(event.payload, context) }
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
      throw error
    }
  }
}
