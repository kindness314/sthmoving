import { CategoryService } from '../categories/service'
import type { ApiDependencies } from '../dependencies'
import { ApiException } from '../errors'
import type { ApiHandler } from '../types'

interface CreatePayload {
  name?: unknown
}

interface UpdatePayload {
  categoryId?: unknown
  name?: unknown
  status?: unknown
}

function createService(deps: ApiDependencies): CategoryService {
  return new CategoryService(deps.categories)
}

export function createCategoryHandlers(
  deps: ApiDependencies,
): Readonly<Record<string, ApiHandler>> {
  return {
    list: async (_payload, context) => createService(deps).list(context.userId),

    listManageable: async (_payload, context) =>
      createService(deps).listManageable(context.userId),

    create: async (payload, context) => {
      const name = (payload as CreatePayload | undefined)?.name
      if (typeof name !== 'string') {
        throw new ApiException(
          'INVALID_CATEGORY_NAME',
          '分类名称必须是字符串',
        )
      }
      return createService(deps).create(context.userId, name)
    },

    rename: async (payload, context) => {
      const input = payload as UpdatePayload | undefined
      if (
        typeof input?.categoryId !== 'string' ||
        typeof input.name !== 'string'
      ) {
        throw new ApiException(
          'INVALID_REQUEST',
          '分类 ID 和新名称必须是字符串',
        )
      }
      return createService(deps).rename(
        context.userId,
        input.categoryId,
        input.name,
      )
    },

    setStatus: async (payload, context) => {
      const input = payload as UpdatePayload | undefined
      if (
        typeof input?.categoryId !== 'string' ||
        (input.status !== 'ACTIVE' && input.status !== 'DISABLED')
      ) {
        throw new ApiException('INVALID_REQUEST', '分类状态请求无效')
      }
      return createService(deps).setStatus(
        context.userId,
        input.categoryId,
        input.status,
      )
    },

    delete: async (payload, context) => {
      const categoryId = (payload as UpdatePayload | undefined)?.categoryId
      if (typeof categoryId !== 'string') {
        throw new ApiException('INVALID_REQUEST', '分类 ID 必须是字符串')
      }
      return createService(deps).delete(context.userId, categoryId)
    },
  }
}
