import { ApiException } from '../errors'
import { CloudItemRepository } from '../items/cloud-repository'
import { ItemService } from '../items/service'
import type { QuantityMode } from '../items/types'
import type { ApiHandler } from '../types'

interface CreateItemPayload {
  name?: unknown
  images?: unknown
  description?: unknown
  quantityMode?: unknown
  quantity?: unknown
  categoryId?: unknown
  newCategoryName?: unknown
  commitSummary?: unknown
}

function createService(): ItemService {
  return new ItemService(new CloudItemRepository())
}

export const itemHandlers: Readonly<Record<string, ApiHandler>> = {
  create: async (payload, context) => {
    const input = payload as CreateItemPayload | undefined
    if (
      typeof input?.name !== 'string' ||
      (input.images !== undefined && !Array.isArray(input.images)) ||
      (input.description !== undefined &&
        typeof input.description !== 'string') ||
      !isQuantityMode(input.quantityMode) ||
      typeof input.quantity !== 'number' ||
      (input.categoryId !== undefined &&
        typeof input.categoryId !== 'string') ||
      (input.newCategoryName !== undefined &&
        typeof input.newCategoryName !== 'string') ||
      typeof input.commitSummary !== 'string'
    ) {
      throw new ApiException(
        'INVALID_REQUEST',
        '物品登记请求字段无效',
      )
    }

    const hasCategoryId = typeof input.categoryId === 'string'
    const hasNewCategoryName =
      typeof input.newCategoryName === 'string'
    if (hasCategoryId === hasNewCategoryName) {
      throw new ApiException(
        'INVALID_CATEGORY_SELECTION',
        '必须选择已有分类或填写一个新分类',
      )
    }

    const categorySelection =
      typeof input.categoryId === 'string'
        ? { categoryId: input.categoryId }
        : { newCategoryName: input.newCategoryName as string }
    return createService().create(context.openid, {
      name: input.name,
      images: input.images ?? [],
      description: input.description ?? '',
      quantityMode: input.quantityMode,
      quantity: input.quantity,
      ...categorySelection,
      commitSummary: input.commitSummary,
    })
  },
}

function isQuantityMode(value: unknown): value is QuantityMode {
  return value === 'SINGLE' || value === 'MULTIPLE'
}
