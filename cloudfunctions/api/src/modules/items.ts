import { ApiException } from '../errors'
import { CloudStorageUrlResolver } from '../cloud-storage'
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

interface ListItemsPayload {
  keyword?: unknown
  categoryId?: unknown
  cursor?: unknown
  limit?: unknown
  status?: unknown
}

interface UpdateItemPayload {
  itemId?: unknown
  expectedVersion?: unknown
  name?: unknown
  images?: unknown
  description?: unknown
  quantityMode?: unknown
  quantity?: unknown
  categoryId?: unknown
  commitSummary?: unknown
}

function createService(): ItemService {
  const storage = new CloudStorageUrlResolver()
  return new ItemService(
    new CloudItemRepository(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    (fileIds) => storage.resolve(fileIds),
  )
}

export const itemHandlers: Readonly<Record<string, ApiHandler>> = {
  list: async (payload, context) => {
    const input = payload as ListItemsPayload | undefined
    if (
      (input?.keyword !== undefined &&
        typeof input.keyword !== 'string') ||
      (input?.categoryId !== undefined &&
        typeof input.categoryId !== 'string') ||
      (input?.limit !== undefined &&
        typeof input.limit !== 'number') ||
      (input?.status !== undefined &&
        input.status !== 'ACTIVE' &&
        input.status !== 'OUTBOUND_PENDING' &&
        input.status !== 'OFF_SHELF') ||
      (input?.cursor !== undefined && !isCursor(input.cursor))
    ) {
      throw new ApiException(
        'INVALID_REQUEST',
        '物品查询请求字段无效',
      )
    }
    return createService().list(context.openid, {
      ...(typeof input?.keyword === 'string'
        ? { keyword: input.keyword }
        : {}),
      ...(typeof input?.categoryId === 'string'
        ? { categoryId: input.categoryId }
        : {}),
      ...(typeof input?.limit === 'number' ? { limit: input.limit } : {}),
      ...(typeof input?.status === 'string'
        ? { status: input.status as 'ACTIVE' | 'OUTBOUND_PENDING' | 'OFF_SHELF' }
        : {}),
      ...(isCursor(input?.cursor) ? { cursor: input.cursor } : {}),
    })
  },
  detail: async (payload, context) => {
    const itemId = (payload as { itemId?: unknown } | undefined)?.itemId
    if (typeof itemId !== 'string') {
      throw new ApiException(
        'INVALID_REQUEST',
        '物品详情请求字段无效',
      )
    }
    return createService().detail(context.openid, itemId)
  },
  logs: async (payload, context) => {
    const itemId = (payload as { itemId?: unknown } | undefined)?.itemId
    if (typeof itemId !== 'string') {
      throw new ApiException(
        'INVALID_REQUEST',
        '物品操作日志请求字段无效',
      )
    }
    return createService().logs(context.openid, itemId)
  },
  update: async (payload, context) => {
    const input = payload as UpdateItemPayload | undefined
    if (
      typeof input?.itemId !== 'string' ||
      typeof input.expectedVersion !== 'number' ||
      (input.name !== undefined && typeof input.name !== 'string') ||
      (input.images !== undefined && !Array.isArray(input.images)) ||
      (input.description !== undefined &&
        typeof input.description !== 'string') ||
      (input.quantityMode !== undefined &&
        !isQuantityMode(input.quantityMode)) ||
      (input.quantity !== undefined && typeof input.quantity !== 'number') ||
      (input.categoryId !== undefined && typeof input.categoryId !== 'string') ||
      typeof input.commitSummary !== 'string'
    ) {
      throw new ApiException(
        'INVALID_REQUEST',
        '物品更新请求字段无效',
      )
    }

    return createService().update(context.openid, {
      itemId: input.itemId,
      expectedVersion: input.expectedVersion,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.images !== undefined ? { images: input.images as string[] } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.quantityMode !== undefined
        ? { quantityMode: input.quantityMode }
        : {}),
      ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      commitSummary: input.commitSummary,
    })
  },
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

function isCursor(
  value: unknown,
): value is { updatedAt: string; id: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { updatedAt?: unknown }).updatedAt === 'string' &&
    typeof (value as { id?: unknown }).id === 'string'
  )
}

function isQuantityMode(value: unknown): value is QuantityMode {
  return value === 'SINGLE' || value === 'MULTIPLE'
}
