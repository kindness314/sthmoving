import type { ApiDependencies } from '../dependencies'
import { ApiException } from '../errors'
import { OutboundService } from '../outbound/service'
import type {
  BatchDeleteItemsInput,
  BatchRestoreInboundInput,
  BatchDirectOutboundInput,
  RestoreInboundInput,
} from '../outbound/types'
import type { ApiHandler } from '../types'
import type { ReviewOutboundRequestInput } from '../outbound/types'

interface CreateOutboundPayload {
  itemId?: unknown
  reason?: unknown
}

interface ReviewOutboundPayload {
  requestId?: unknown
  reviewSummary?: unknown
}

interface DirectOutboundPayload {
  itemId?: unknown
  expectedVersion?: unknown
  commitSummary?: unknown
}

interface BatchDirectOutboundPayload {
  items?: unknown
  commitSummary?: unknown
}

interface BatchDeletePayload {
  itemIds?: unknown
}

interface RestoreInboundPayload {
  itemId?: unknown
  expectedVersion?: unknown
  commitSummary?: unknown
}

interface BatchRestoreInboundPayload {
  items?: unknown
  commitSummary?: unknown
}

function createService(deps: ApiDependencies): OutboundService {
  return new OutboundService(
    deps.outbound,
    undefined,
    undefined,
    undefined,
    deps.outboundImages,
  )
}

export function createOutboundHandlers(
  deps: ApiDependencies,
): Readonly<Record<string, ApiHandler>> {
  return {
    create: async (payload, context) => {
      const input = payload as CreateOutboundPayload | undefined
      if (
        typeof input?.itemId !== 'string' ||
        typeof input.reason !== 'string'
      ) {
        throw new ApiException(
          'INVALID_REQUEST',
          '离库申请请求字段无效',
        )
      }
      return createService(deps).createRequest(context.userId, {
        itemId: input.itemId,
        reason: input.reason,
      })
    },

    listPending: async (_payload, context) =>
      createService(deps).listPendingRequests(context.userId),

    listMine: async (_payload, context) =>
      createService(deps).listMyRequests(context.userId),

    pendingByItem: async (payload, context) => {
      const itemId = (payload as { itemId?: unknown } | undefined)?.itemId
      if (typeof itemId !== 'string') {
        throw new ApiException('INVALID_ITEM_ID', '物品 ID 无效')
      }
      return createService(deps).getPendingRequestByItem(context.userId, itemId)
    },

    approve: async (payload, context) => {
      const input = parseReviewPayload(payload, false)
      return createService(deps).approveRequest(context.userId, input)
    },

    reject: async (payload, context) => {
      const input = parseReviewPayload(payload, true)
      return createService(deps).rejectRequest(context.userId, input)
    },

    direct: async (payload, context) => {
      const input = payload as DirectOutboundPayload | undefined
      if (
        typeof input?.itemId !== 'string' ||
        typeof input.expectedVersion !== 'number' ||
        typeof input.commitSummary !== 'string'
      ) {
        throw new ApiException(
          'INVALID_REQUEST',
          '直接离库请求字段无效',
        )
      }
      return createService(deps).directOutbound(context.userId, {
        itemId: input.itemId,
        expectedVersion: input.expectedVersion,
        commitSummary: input.commitSummary,
      })
    },

    restore: async (payload, context) => {
      const input = parseRestorePayload(payload)
      return createService(deps).restoreInbound(context.userId, input)
    },

    batchRestore: async (payload, context) => {
      const input = parseBatchRestorePayload(payload)
      return createService(deps).batchRestoreInbound(context.userId, input)
    },

    batchDirect: async (payload, context) => {
      const input = parseBatchDirectPayload(payload)
      return createService(deps).batchDirectOutbound(context.userId, input)
    },

    batchDelete: async (payload, context) => {
      const input = parseBatchDeletePayload(payload)
      return createService(deps).deleteItems(context.userId, input)
    },
  }
}

function parseReviewPayload(
  payload: unknown,
  requireSummary: boolean,
): ReviewOutboundRequestInput {
  const input = payload as ReviewOutboundPayload | undefined
  if (
    typeof input?.requestId !== 'string' ||
    (requireSummary && typeof input.reviewSummary !== 'string') ||
    (!requireSummary &&
      input.reviewSummary !== undefined &&
      typeof input.reviewSummary !== 'string')
  ) {
    throw new ApiException(
      'INVALID_REQUEST',
      '离库审核请求字段无效',
    )
  }
  return {
    requestId: input.requestId,
    ...(typeof input.reviewSummary === 'string'
      ? { reviewSummary: input.reviewSummary }
      : {}),
  }
}

function parseBatchDirectPayload(
  payload: unknown,
): BatchDirectOutboundInput {
  const input = payload as BatchDirectOutboundPayload | undefined
  if (!Array.isArray(input?.items) || typeof input.commitSummary !== 'string') {
    throw new ApiException('INVALID_REQUEST', '批量离库请求字段无效')
  }
  if (
    input.items.some(
      (entry) =>
        typeof entry !== 'object' ||
        entry === null ||
        typeof (entry as { itemId?: unknown }).itemId !== 'string' ||
        typeof (entry as { expectedVersion?: unknown }).expectedVersion !==
          'number',
    )
  ) {
    throw new ApiException('INVALID_REQUEST', '批量离库物品字段无效')
  }
  return {
    items: input.items as BatchDirectOutboundInput['items'],
    commitSummary: input.commitSummary,
  }
}

function parseBatchDeletePayload(payload: unknown): BatchDeleteItemsInput {
  const input = payload as BatchDeletePayload | undefined
  if (
    !Array.isArray(input?.itemIds) ||
    input.itemIds.some((itemId) => typeof itemId !== 'string')
  ) {
    throw new ApiException('INVALID_REQUEST', '批量删除请求字段无效')
  }
  return { itemIds: input.itemIds as string[] }
}

function parseRestorePayload(payload: unknown): RestoreInboundInput {
  const input = payload as RestoreInboundPayload | undefined
  if (
    typeof input?.itemId !== 'string' ||
    typeof input.expectedVersion !== 'number' ||
    typeof input.commitSummary !== 'string'
  ) {
    throw new ApiException('INVALID_REQUEST', '重新入库请求字段无效')
  }
  return {
    itemId: input.itemId,
    expectedVersion: input.expectedVersion,
    commitSummary: input.commitSummary,
  }
}

function parseBatchRestorePayload(
  payload: unknown,
): BatchRestoreInboundInput {
  const input = payload as BatchRestoreInboundPayload | undefined
  if (!Array.isArray(input?.items) || typeof input.commitSummary !== 'string') {
    throw new ApiException(
      'INVALID_REQUEST',
      '批量重新入库请求字段无效',
    )
  }
  if (
    input.items.some(
      (entry) =>
        typeof entry !== 'object' ||
        entry === null ||
        typeof (entry as { itemId?: unknown }).itemId !== 'string' ||
        typeof (entry as { expectedVersion?: unknown }).expectedVersion !==
          'number',
    )
  ) {
    throw new ApiException('INVALID_REQUEST', '批量重新入库物品字段无效')
  }
  return {
    items: input.items as BatchRestoreInboundInput['items'],
    commitSummary: input.commitSummary,
  }
}
