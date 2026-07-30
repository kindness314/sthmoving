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
      typeof input.categoryId !== 'string' ||
      typeof input.commitSummary !== 'string'
    ) {
      throw new ApiException(
        'INVALID_REQUEST',
        '物品登记请求字段无效',
      )
    }

    return createService().create(context.openid, {
      name: input.name,
      images: input.images ?? [],
      description: input.description ?? '',
      quantityMode: input.quantityMode,
      quantity: input.quantity,
      categoryId: input.categoryId,
      commitSummary: input.commitSummary,
    })
  },
}

function isQuantityMode(value: unknown): value is QuantityMode {
  return value === 'SINGLE' || value === 'MULTIPLE'
}
