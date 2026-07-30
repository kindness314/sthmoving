import { CategoryService } from '../categories/service'
import { CloudCategoryRepository } from '../categories/cloud-repository'
import { ApiException } from '../errors'
import type { ApiHandler } from '../types'

interface CreatePayload {
  name?: unknown
}

function createService(): CategoryService {
  return new CategoryService(new CloudCategoryRepository())
}

export const categoryHandlers: Readonly<Record<string, ApiHandler>> = {
  list: async (_payload, context) => createService().list(context.openid),

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
}
