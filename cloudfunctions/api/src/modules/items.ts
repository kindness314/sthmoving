import type { ApiDependencies } from '../dependencies'
import { ApiException } from '../errors'
import { ItemService } from '../items/service'
import type { QuantityMode } from '../items/types'
import type { ApiHandler } from '../types'

interface CreateItemPayload {
  name?: unknown
  images?: unknown
  description?: unknown
  quantityMode?: unknown
  quantity?: unknown
  ownerId?: unknown
  donorId?: unknown
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
  ownership?: unknown
  ownershipUserId?: unknown
}

interface UpdateItemPayload {
  itemId?: unknown
  expectedVersion?: unknown
  name?: unknown
  images?: unknown
  description?: unknown
  quantityMode?: unknown
  quantity?: unknown
  ownerId?: unknown
  donorId?: unknown
  categoryId?: unknown
  commitSummary?: unknown
}

function parseOwnershipId(
  value: unknown,
  field: string,
): string | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'string') {
    throw new ApiException(
      'INVALID_OWNERSHIP_USER_ID',
      `${field}必须是字符串成员 ID`,
    )
  }
  return value
}

function parseOwnershipIdOrNull(
  value: unknown,
  field: string,
): string | null | undefined {
  if (value === undefined || value === null) {
    return value
  }
  return parseOwnershipId(value, field)
}

function createService(deps: ApiDependencies): ItemService {
  return new ItemService(
    deps.items,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    deps.resolveFileUrls,
  )
}

export function createItemHandlers(
  deps: ApiDependencies,
): Readonly<Record<string, ApiHandler>> {
  return {
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
        (input?.ownership !== undefined &&
          input.ownership !== 'PUBLIC' &&
          input.ownership !== 'PRIVATE') ||
        (input?.ownershipUserId !== undefined &&
          typeof input.ownershipUserId !== 'string') ||
        (input?.cursor !== undefined && !isCursor(input.cursor))
      ) {
        throw new ApiException(
          'INVALID_REQUEST',
          '物品查询请求字段无效',
        )
      }
      return createService(deps).list(context.userId, {
        ...(typeof input?.keyword === 'string'
          ? { keyword: input.keyword }
          : {}),
        ...(typeof input?.categoryId === 'string'
          ? { categoryId: input.categoryId }
          : {}),
        ...(typeof input?.limit === 'number' ? { limit: input.limit } : {}),
        ...(typeof input?.status === 'string'
          ? {
              status: input.status as
                | 'ACTIVE'
                | 'OUTBOUND_PENDING'
                | 'OFF_SHELF',
            }
          : {}),
        ...(isCursor(input?.cursor) ? { cursor: input.cursor } : {}),
        ...(input?.ownership === 'PUBLIC' || input?.ownership === 'PRIVATE'
          ? { ownership: input.ownership }
          : {}),
        ...(typeof input?.ownershipUserId === 'string'
          ? { ownershipUserId: input.ownershipUserId }
          : {}),
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
      return createService(deps).detail(context.userId, itemId)
    },
    logs: async (payload, context) => {
      const itemId = (payload as { itemId?: unknown } | undefined)?.itemId
      if (typeof itemId !== 'string') {
        throw new ApiException(
          'INVALID_REQUEST',
          '物品操作日志请求字段无效',
        )
      }
      return createService(deps).logs(context.userId, itemId)
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
        (input.ownerId !== undefined &&
          input.ownerId !== null &&
          typeof input.ownerId !== 'string') ||
        (input.donorId !== undefined &&
          input.donorId !== null &&
          typeof input.donorId !== 'string') ||
        (input.categoryId !== undefined &&
          typeof input.categoryId !== 'string') ||
        typeof input.commitSummary !== 'string'
      ) {
        throw new ApiException(
          'INVALID_REQUEST',
          '物品更新请求字段无效',
        )
      }

      const ownerId = parseOwnershipIdOrNull(input.ownerId, '所有者')
      const donorId = parseOwnershipIdOrNull(input.donorId, '捐赠者')
      return createService(deps).update(context.userId, {
        itemId: input.itemId,
        expectedVersion: input.expectedVersion,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.images !== undefined
          ? { images: input.images as string[] }
          : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.quantityMode !== undefined
          ? { quantityMode: input.quantityMode }
          : {}),
        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
        ...(input.categoryId !== undefined
          ? { categoryId: input.categoryId }
          : {}),
        ...(ownerId !== undefined ? { ownerId } : {}),
        ...(donorId !== undefined ? { donorId } : {}),
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
        (input.ownerId !== undefined && typeof input.ownerId !== 'string') ||
        (input.donorId !== undefined && typeof input.donorId !== 'string') ||
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
      const ownerId = parseOwnershipId(input.ownerId, '所有者')
      const donorId = parseOwnershipId(input.donorId, '捐赠者')
      return createService(deps).create(context.userId, {
        name: input.name,
        images: input.images ?? [],
        description: input.description ?? '',
        quantityMode: input.quantityMode,
        quantity: input.quantity,
        ...categorySelection,
        ...(ownerId !== undefined ? { ownerId } : {}),
        ...(donorId !== undefined ? { donorId } : {}),
        commitSummary: input.commitSummary,
      })
    },
  }
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
