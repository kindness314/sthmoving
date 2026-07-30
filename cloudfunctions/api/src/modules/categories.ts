import { CategoryService } from '../categories/service'
import { CloudCategoryRepository } from '../categories/cloud-repository'
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

function createService(): CategoryService {
  return new CategoryService(new CloudCategoryRepository())
}

export const categoryHandlers: Readonly<Record<string, ApiHandler>> = {
  list: async (_payload, context) => createService().list(context.openid),

  listManageable: async (_payload, context) =>
    createService().listManageable(context.openid),

  create: async (payload, context) => {
    const name = (payload as CreatePayload | undefined)?.name
    if (typeof name !== 'string') {
      throw new ApiException(
        'INVALID_CATEGORY_NAME',
        '分类名称必须是字符串',
      )
    }
    return createService().create(context.openid, name)
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
    return createService().rename(
      context.openid,
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
    return createService().setStatus(
      context.openid,
      input.categoryId,
      input.status,
    )
  },

  delete: async (payload, context) => {
    const categoryId = (payload as UpdatePayload | undefined)?.categoryId
    if (typeof categoryId !== 'string') {
      throw new ApiException('INVALID_REQUEST', '分类 ID 必须是字符串')
    }
    return createService().delete(context.openid, categoryId)
  },
}
