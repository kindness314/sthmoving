import { randomUUID } from 'node:crypto'

import { ApiException } from '../errors'
import type { ItemLabelRecord } from '../labels/types'
import type { UserRecord } from '../membership/types'
import type { ItemOperationLogRecord, ItemRecord } from '../items/types'
import type { OutboundRepository } from './repository'
import type { OutboundImageStorage } from './storage'
import type {
  BatchDeleteItemsInput,
  BatchRestoreInboundInput,
  BatchDirectOutboundInput,
  CreateOutboundRequestInput,
  DirectOutboundInput,
  OutboundRequestRecord,
  PublicOutboundRequest,
  PublicOutboundRequestDetail,
  PublicPendingOutboundByItem,
  PublicMyOutboundRequest,
  PublicBatchDeleteResult,
  PublicBatchRestoreInboundResult,
  PublicBatchDirectOutboundResult,
  PublicDirectOutboundResult,
  PublicRestoreInboundResult,
  ReviewOutboundRequestInput,
  RestoreInboundInput,
} from './types'

export class OutboundService {
  constructor(
    private readonly repository: OutboundRepository,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly createRequestId: () => string = () =>
      `outbound-${randomUUID()}`,
    private readonly createLogId: () => string = () =>
      `item-log-${randomUUID()}`,
    private readonly imageStorage: OutboundImageStorage = {
      delete: async () => undefined,
    },
  ) {}

  async createRequest(
    openid: string,
    input: CreateOutboundRequestInput,
  ): Promise<PublicOutboundRequest> {
    const validated = validateCreateInput(input)

    return this.repository.runTransaction(async (unitOfWork) => {
      const user = await unitOfWork.getUserByOpenid(openid)
      requireApprovedUser(user, openid)

      const item = await unitOfWork.getItem(validated.itemId)
      if (!item) {
        throw new ApiException('ITEM_NOT_FOUND', '未找到物品')
      }
      if (item.status === 'OFF_SHELF') {
        throw new ApiException(
          'ITEM_NOT_REQUESTABLE',
          '已离库物品不能再次申请离库',
        )
      }
      if (item.status === 'OUTBOUND_PENDING') {
        throw new ApiException(
          'OUTBOUND_REQUEST_PENDING',
          '该物品已有待处理的离库申请',
        )
      }

      const pendingRequest = await unitOfWork.findPendingRequest(item._id)
      if (pendingRequest) {
        throw new ApiException(
          'OUTBOUND_REQUEST_PENDING',
          '该物品已有待处理的离库申请',
        )
      }
      if (item.status !== 'ACTIVE') {
        throw new ApiException(
          'ITEM_NOT_REQUESTABLE',
          '当前物品状态不能申请离库',
        )
      }

      const now = this.now()
      const request: OutboundRequestRecord = {
        _id: this.createRequestId(),
        item_id: item._id,
        applicant_id: user._id,
        reason: validated.reason,
        status: 'PENDING',
        created_at: now,
        updated_at: now,
      }
      const updatedItem: ItemRecord = {
        ...item,
        status: 'OUTBOUND_PENDING',
        version: item.version + 1,
        updated_by: user._id,
        updated_at: now,
      }
      const log: ItemOperationLogRecord = {
        _id: this.createLogId(),
        item_id: item._id,
        operator_id: user._id,
        action_type: 'OUTBOUND_REQUEST',
        commit_summary: validated.reason,
        version_before: item.version,
        version_after: updatedItem.version,
        created_at: now,
      }

      await unitOfWork.setRequest(request)
      await unitOfWork.setItem(updatedItem)
      await unitOfWork.setOperationLog(log)
      return toPublicRequest(request)
    })
  }

  async listPendingRequests(
    openid: string,
  ): Promise<PublicOutboundRequestDetail[]> {
    return this.repository.runTransaction(async (unitOfWork) => {
      const reviewer = await unitOfWork.getUserByOpenid(openid)
      requireReviewer(reviewer, openid)
      const requests = await unitOfWork.listPendingRequests(50)
      const result: PublicOutboundRequestDetail[] = []
      for (const request of requests) {
        const applicant = await unitOfWork.getUser(request.applicant_id)
        const item = await unitOfWork.getItem(request.item_id)
        if (!applicant || !item) {
          throw new ApiException(
            'OUTBOUND_DATA_INVALID',
            '离库申请关联的用户或物品不存在',
          )
        }
        result.push({
          ...toPublicRequest(request),
          applicant: {
            id: applicant._id,
            displayName: applicant.display_name,
          },
          item: {
            id: item._id,
            code: item.code,
            name: item.name,
            status: item.status,
            version: item.version,
          },
        })
      }
      return result
    })
  }

  async listMyRequests(openid: string): Promise<PublicMyOutboundRequest[]> {
    return this.repository.runTransaction(async (unitOfWork) => {
      const user = await unitOfWork.getUserByOpenid(openid)
      requireApprovedUser(user, openid)
      const requests = await unitOfWork.listRequestsByApplicant(user._id, 50)
      const result: PublicMyOutboundRequest[] = []
      for (const request of requests) {
        const item = await unitOfWork.getItem(request.item_id)
        result.push({
          ...toPublicRequest(request),
          item:
            item && item.status !== 'OFF_SHELF'
              ? {
                id: item._id,
                code: item.code,
                name: item.name,
                status: item.status,
                version: item.version,
              }
              : null,
        })
      }
      return result
    })
  }

  async getPendingRequestByItem(
    openid: string,
    itemIdInput: string,
  ): Promise<PublicPendingOutboundByItem | null> {
    const itemId = itemIdInput.trim()
    if (!itemId || itemId.length > 100) {
      throw new ApiException('INVALID_ITEM_ID', '物品 ID 无效')
    }
    return this.repository.runTransaction(async (unitOfWork) => {
      const reviewer = await unitOfWork.getUserByOpenid(openid)
      requireReviewer(reviewer, openid)
      const request = await unitOfWork.findPendingRequest(itemId)
      if (!request) {
        return null
      }
      const applicant = await unitOfWork.getUser(request.applicant_id)
      if (!applicant) {
        throw new ApiException('OUTBOUND_DATA_INVALID', '离库申请关联的用户不存在')
      }
      return {
        id: request._id,
        itemId: request.item_id,
        reason: request.reason,
        applicant: {
          id: applicant._id,
          displayName: applicant.display_name,
        },
        createdAt: request.created_at,
      }
    })
  }

  async approveRequest(
    openid: string,
    input: ReviewOutboundRequestInput,
  ): Promise<PublicOutboundRequest> {
    const validated = validateReviewInput(input, 'APPROVE')
    return this.reviewRequest(openid, validated, 'APPROVE')
  }

  async rejectRequest(
    openid: string,
    input: ReviewOutboundRequestInput,
  ): Promise<PublicOutboundRequest> {
    const validated = validateReviewInput(input, 'REJECT')
    return this.reviewRequest(openid, validated, 'REJECT')
  }

  async directOutbound(
    openid: string,
    input: DirectOutboundInput,
  ): Promise<PublicDirectOutboundResult> {
    const validated = validateDirectInput(input)
    return this.repository.runTransaction(async (unitOfWork) => {
      const reviewer = await unitOfWork.getUserByOpenid(openid)
      requireReviewer(reviewer, openid)
      const item = await unitOfWork.getItem(validated.itemId)
      if (!item) {
        throw new ApiException('ITEM_NOT_FOUND', '未找到物品')
      }
      if (item.status !== 'ACTIVE') {
        throw new ApiException(
          'ITEM_NOT_DIRECT_OUTBOUND',
          '只有在库物品可以直接离库',
        )
      }
      if (item.version !== validated.expectedVersion) {
        throw new ApiException(
          'VERSION_CONFLICT',
          '物品已被其他成员更新，请刷新后重试',
          { latestVersion: item.version },
        )
      }
      const label = await unitOfWork.getLabelByItemId(item._id)
      if (!label) {
        throw new ApiException(
          'LABEL_NOT_FOUND',
          '物品标签记录不存在，无法完成离库',
        )
      }

      const now = this.now()
      const updatedItem: ItemRecord = {
        ...item,
        status: 'OFF_SHELF',
        version: item.version + 1,
        updated_by: reviewer._id,
        updated_at: now,
        off_shelf_by: reviewer._id,
        off_shelf_at: now,
      }
      const voidLabel = markLabelVoid(label, now)
      const log = createLog(
        this.createLogId(),
        item,
        updatedItem,
        reviewer._id,
        'OUTBOUND',
        validated.commitSummary,
        now,
      )
      await unitOfWork.setItem(updatedItem)
      await unitOfWork.setLabel(voidLabel)
      await unitOfWork.setOperationLog(log)
      return {
        itemId: updatedItem._id,
        status: 'OFF_SHELF',
        version: updatedItem.version,
        offShelfAt: now,
      }
    })
  }

  async restoreInbound(
    openid: string,
    input: RestoreInboundInput,
  ): Promise<PublicRestoreInboundResult> {
    const validated = validateRestoreInput(input)
    return this.repository.runTransaction(async (unitOfWork) => {
      const reviewer = await unitOfWork.getUserByOpenid(openid)
      requireReviewer(reviewer, openid)
      const item = await unitOfWork.getItem(validated.itemId)
      if (!item) {
        throw new ApiException('ITEM_NOT_FOUND', '未找到物品')
      }
      if (item.status !== 'OFF_SHELF') {
        throw new ApiException(
          'ITEM_NOT_RESTORABLE',
          '只有已离库物品可以重新入库',
        )
      }
      if (item.version !== validated.expectedVersion) {
        throw new ApiException(
          'VERSION_CONFLICT',
          '物品版本已变化，请刷新后重试',
          { latestVersion: item.version },
        )
      }
      const label = await unitOfWork.getLabelByItemId(item._id)
      if (!label) {
        throw new ApiException(
          'LABEL_NOT_FOUND',
          '物品标签记录不存在，无法重新入库',
        )
      }
      if (label.status !== 'VOID') {
        throw new ApiException(
          'LABEL_DATA_INVALID',
          '物品标签状态与离库状态不一致',
        )
      }

      const now = this.now()
      const restoredItem: ItemRecord = {
        ...item,
        status: 'ACTIVE',
        version: item.version + 1,
        updated_by: reviewer._id,
        updated_at: now,
      }
      delete restoredItem.off_shelf_by
      delete restoredItem.off_shelf_at
      const restoredLabel = {
        ...label,
        status: label.status_before_void ?? 'READY',
        updated_at: now,
      }
      delete restoredLabel.status_before_void
      await unitOfWork.setItem(restoredItem)
      await unitOfWork.setLabel(restoredLabel)
      await unitOfWork.setOperationLog(
        createLog(
          this.createLogId(),
          item,
          restoredItem,
          reviewer._id,
          'INBOUND',
          validated.commitSummary,
          now,
        ),
      )
      return {
        itemId: restoredItem._id,
        status: 'ACTIVE',
        version: restoredItem.version,
        restoredAt: now,
      }
    })
  }

  async batchRestoreInbound(
    openid: string,
    input: BatchRestoreInboundInput,
  ): Promise<PublicBatchRestoreInboundResult> {
    const validated = validateBatchRestoreInput(input)
    return this.repository.runTransaction(async (unitOfWork) => {
      const reviewer = await unitOfWork.getUserByOpenid(openid)
      requireReviewer(reviewer, openid)

      const items: Array<{
        item: ItemRecord
        label: NonNullable<Awaited<ReturnType<typeof unitOfWork.getLabelByItemId>>>
      }> = []
      const conflicts: Array<{
        itemId: string
        latestVersion: number
      }> = []
      for (const entry of validated.items) {
        const item = await unitOfWork.getItem(entry.itemId)
        if (!item) {
          throw new ApiException('ITEM_NOT_FOUND', '未找到物品', {
            itemId: entry.itemId,
          })
        }
        if (item.status !== 'OFF_SHELF') {
          throw new ApiException(
            'ITEM_NOT_RESTORABLE',
            '只有已离库物品可以重新入库',
            { itemId: item._id },
          )
        }
        if (item.version !== entry.expectedVersion) {
          conflicts.push({
            itemId: item._id,
            latestVersion: item.version,
          })
          continue
        }
        const label = await unitOfWork.getLabelByItemId(item._id)
        if (!label) {
          throw new ApiException(
            'LABEL_NOT_FOUND',
            '物品标签记录不存在，无法重新入库',
            { itemId: item._id },
          )
        }
        if (label.status !== 'VOID') {
          throw new ApiException(
            'LABEL_DATA_INVALID',
            '物品标签状态与离库状态不一致',
            { itemId: item._id },
          )
        }
        items.push({ item, label })
      }
      if (conflicts.length > 0) {
        throw new ApiException(
          'VERSION_CONFLICT',
          '部分物品版本已变化，请刷新后重试',
          { conflicts },
        )
      }

      const now = this.now()
      const versionAfter: Record<string, number> = {}
      for (const { item, label } of items) {
        const restoredItem: ItemRecord = {
          ...item,
          status: 'ACTIVE',
          version: item.version + 1,
          updated_by: reviewer._id,
          updated_at: now,
        }
        delete restoredItem.off_shelf_by
        delete restoredItem.off_shelf_at
        const restoredLabel = {
          ...label,
          status: label.status_before_void ?? 'READY',
          updated_at: now,
        }
        delete restoredLabel.status_before_void
        versionAfter[item._id] = restoredItem.version
        await unitOfWork.setItem(restoredItem)
        await unitOfWork.setLabel(restoredLabel)
        await unitOfWork.setOperationLog(
          createLog(
            this.createLogId(),
            item,
            restoredItem,
            reviewer._id,
            'INBOUND',
            validated.commitSummary,
            now,
          ),
        )
      }
      return {
        itemIds: items.map(({ item }) => item._id),
        versionAfter,
        restoredAt: now,
      }
    })
  }

  async batchDirectOutbound(
    openid: string,
    input: BatchDirectOutboundInput,
  ): Promise<PublicBatchDirectOutboundResult> {
    const validated = validateBatchDirectInput(input)
    return this.repository.runTransaction(async (unitOfWork) => {
      const reviewer = await unitOfWork.getUserByOpenid(openid)
      requireReviewer(reviewer, openid)

      const items: Array<{
        item: ItemRecord
        label: NonNullable<Awaited<ReturnType<typeof unitOfWork.getLabelByItemId>>>
      }> = []
      const conflicts: Array<{
        itemId: string
        latestVersion: number
      }> = []
      for (const entry of validated.items) {
        const item = await unitOfWork.getItem(entry.itemId)
        if (!item) {
          throw new ApiException('ITEM_NOT_FOUND', '未找到物品', {
            itemId: entry.itemId,
          })
        }
        if (item.status !== 'ACTIVE') {
          throw new ApiException(
            'ITEM_NOT_DIRECT_OUTBOUND',
            '只有在库物品可以直接离库',
            { itemId: item._id },
          )
        }
        if (item.version !== entry.expectedVersion) {
          conflicts.push({
            itemId: item._id,
            latestVersion: item.version,
          })
          continue
        }
        const label = await unitOfWork.getLabelByItemId(item._id)
        if (!label) {
          throw new ApiException(
            'LABEL_NOT_FOUND',
            '物品标签记录不存在，无法完成离库',
            { itemId: item._id },
          )
        }
        items.push({ item, label })
      }
      if (conflicts.length > 0) {
        throw new ApiException(
          'VERSION_CONFLICT',
          '部分物品已被更新，请刷新后重试',
          { conflicts },
        )
      }

      const now = this.now()
      const versionAfter: Record<string, number> = {}
      for (const { item, label } of items) {
        const updatedItem: ItemRecord = {
          ...item,
          status: 'OFF_SHELF',
          version: item.version + 1,
          updated_by: reviewer._id,
          updated_at: now,
          off_shelf_by: reviewer._id,
          off_shelf_at: now,
        }
        versionAfter[item._id] = updatedItem.version
        await unitOfWork.setItem(updatedItem)
        await unitOfWork.setLabel(markLabelVoid(label, now))
        await unitOfWork.setOperationLog(
          createLog(
            this.createLogId(),
            item,
            updatedItem,
            reviewer._id,
            'OUTBOUND',
            validated.commitSummary,
            now,
          ),
        )
      }
      return {
        itemIds: items.map(({ item }) => item._id),
        versionAfter,
        offShelfAt: now,
      }
    })
  }

  async deleteItems(
    openid: string,
    input: BatchDeleteItemsInput,
  ): Promise<PublicBatchDeleteResult> {
    const validated = validateBatchDeleteInput(input)
    const deleted = await this.repository.runTransaction(
      async (unitOfWork) => {
        const reviewer = await unitOfWork.getUserByOpenid(openid)
        requireReviewer(reviewer, openid)
        const items: ItemRecord[] = []
        const labels = [] as Array<NonNullable<
          Awaited<ReturnType<typeof unitOfWork.getLabelByItemId>>
        >>
        for (const itemId of validated.itemIds) {
          const item = await unitOfWork.getItem(itemId)
          if (!item) {
            throw new ApiException('ITEM_NOT_FOUND', '未找到物品', {
              itemId,
            })
          }
          if (item.status !== 'OFF_SHELF') {
            throw new ApiException(
              'ITEM_NOT_DELETABLE',
              '只有已离库物品可以删除',
              { itemId: item._id },
            )
          }
          items.push(item)
          const label = await unitOfWork.getLabelByItemId(item._id)
          if (label) {
            labels.push(label)
          }
        }
        for (const item of items) {
          await unitOfWork.deleteItem(item._id)
        }
        for (const label of labels) {
          await unitOfWork.setLabel({
            ...label,
            status: 'VOID',
            updated_at: this.now(),
          })
        }
        return items
      },
    )
    const imageFileIds = [
      ...new Set(deleted.flatMap((item) => item.images)),
    ]
    try {
      await this.imageStorage.delete(imageFileIds)
    } catch (error) {
      throw new ApiException(
        'ITEM_IMAGE_DELETE_FAILED',
        '物品已删除，但图片文件清理失败，请联系管理员处理',
        {
          itemIds: deleted.map((item) => item._id),
          message: error instanceof Error ? error.message : String(error),
        },
      )
    }
    return {
      itemIds: deleted.map((item) => item._id),
      deletedImageCount: imageFileIds.length,
    }
  }

  private async reviewRequest(
    openid: string,
    input: ReviewOutboundRequestInput,
    decision: 'APPROVE' | 'REJECT',
  ): Promise<PublicOutboundRequest> {
    return this.repository.runTransaction(async (unitOfWork) => {
      const reviewer = await unitOfWork.getUserByOpenid(openid)
      requireReviewer(reviewer, openid)
      const request = await unitOfWork.getRequest(input.requestId)
      if (!request) {
        throw new ApiException(
          'OUTBOUND_REQUEST_NOT_FOUND',
          '离库申请不存在',
        )
      }
      if (request.status !== 'PENDING') {
        throw new ApiException(
          'OUTBOUND_REQUEST_REVIEWED',
          '该离库申请已经处理',
        )
      }
      const item = await unitOfWork.getItem(request.item_id)
      if (!item || item.status !== 'OUTBOUND_PENDING') {
        throw new ApiException(
          'OUTBOUND_STATE_CONFLICT',
          '物品状态已变化，无法处理该离库申请',
        )
      }

      const now = this.now()
      const approved = decision === 'APPROVE'
      const updatedRequest: OutboundRequestRecord = {
        ...request,
        status: approved ? 'APPROVED' : 'REJECTED',
        reviewer_id: reviewer._id,
        reviewed_at: now,
        updated_at: now,
        ...(input.reviewSummary
          ? { review_summary: input.reviewSummary }
          : {}),
      }
      const updatedItem: ItemRecord = {
        ...item,
        status: approved ? 'OFF_SHELF' : 'ACTIVE',
        version: item.version + 1,
        updated_by: reviewer._id,
        updated_at: now,
        ...(approved
          ? { off_shelf_by: reviewer._id, off_shelf_at: now }
          : {}),
      }
      if (!approved) {
        delete updatedItem.off_shelf_by
        delete updatedItem.off_shelf_at
      }
      const log = createLog(
        this.createLogId(),
        item,
        updatedItem,
        reviewer._id,
        approved ? 'OUTBOUND_APPROVE' : 'OUTBOUND_REJECT',
        input.reviewSummary ?? '同意离库申请',
        now,
      )

      await unitOfWork.setRequest(updatedRequest)
      await unitOfWork.setItem(updatedItem)
      if (approved) {
        const label = await unitOfWork.getLabelByItemId(item._id)
        if (!label) {
          throw new ApiException(
            'LABEL_NOT_FOUND',
            '物品标签记录不存在，无法完成离库',
          )
        }
        await unitOfWork.setLabel(markLabelVoid(label, now))
      }
      await unitOfWork.setOperationLog(log)
      return toPublicRequest(updatedRequest)
    })
  }
}

function validateCreateInput(
  input: CreateOutboundRequestInput,
): CreateOutboundRequestInput {
  const itemId = input.itemId.trim()
  if (!itemId || itemId.length > 100) {
    throw new ApiException('INVALID_ITEM_ID', '物品 ID 无效')
  }
  const reason = input.reason.trim()
  if (reason.length < 1 || reason.length > 250) {
    throw new ApiException(
      'INVALID_OUTBOUND_REASON',
      '离库原因不能为空且不能超过 250 个字符',
    )
  }
  return { itemId, reason }
}

function requireApprovedUser(
  user: UserRecord | null,
  openid: string,
): asserts user is UserRecord {
  if (!user || user.openid !== openid) {
    throw new ApiException('UNAUTHENTICATED', '当前微信用户尚未建立账号')
  }
  if (user.status !== 'APPROVED') {
    throw new ApiException('ACCOUNT_NOT_ACTIVE', '当前账号尚未通过审核')
  }
}

function requireReviewer(
  user: UserRecord | null,
  openid: string,
): asserts user is UserRecord {
  requireApprovedUser(user, openid)
  if (
    user.role !== 'ADMIN' &&
    user.role !== 'MANAGER' &&
    user.role !== 'OWNER'
  ) {
    throw new ApiException(
      'FORBIDDEN',
      '只有管理员或所有者可以处理离库申请',
    )
  }
}

function validateReviewInput(
  input: ReviewOutboundRequestInput,
  decision: 'APPROVE' | 'REJECT',
): ReviewOutboundRequestInput {
  const requestId = input.requestId.trim()
  if (!requestId || requestId.length > 100) {
    throw new ApiException('INVALID_REQUEST_ID', '申请 ID 无效')
  }
  if (decision === 'APPROVE') {
    return { requestId }
  }
  return {
    requestId,
    reviewSummary: validateCommitSummary(input.reviewSummary ?? ''),
  }
}

function validateDirectInput(input: DirectOutboundInput): DirectOutboundInput {
  const itemId = input.itemId.trim()
  if (!itemId || itemId.length > 100) {
    throw new ApiException('INVALID_ITEM_ID', '物品 ID 无效')
  }
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new ApiException('INVALID_VERSION', '物品版本无效')
  }
  return {
    itemId,
    expectedVersion: input.expectedVersion,
    commitSummary: validateCommitSummary(input.commitSummary),
  }
}

function validateRestoreInput(
  input: RestoreInboundInput,
): RestoreInboundInput {
  const itemId = input.itemId.trim()
  if (!itemId || itemId.length > 100) {
    throw new ApiException('INVALID_ITEM_ID', '物品 ID 无效')
  }
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new ApiException('INVALID_VERSION', '物品版本无效')
  }
  return {
    itemId,
    expectedVersion: input.expectedVersion,
    commitSummary: validateCommitSummary(input.commitSummary),
  }
}

function validateBatchRestoreInput(
  input: BatchRestoreInboundInput,
): BatchRestoreInboundInput {
  if (
    !Array.isArray(input.items) ||
    input.items.length < 1 ||
    input.items.length > 50
  ) {
    throw new ApiException(
      'INVALID_BATCH_ITEMS',
      '批量重新入库物品数量应为 1 至 50 个',
    )
  }
  const items = input.items.map((entry) => {
    const itemId = entry.itemId.trim()
    if (!itemId || itemId.length > 100) {
      throw new ApiException('INVALID_ITEM_ID', '物品 ID 无效')
    }
    if (
      !Number.isSafeInteger(entry.expectedVersion) ||
      entry.expectedVersion < 1
    ) {
      throw new ApiException('INVALID_VERSION', '物品版本无效', { itemId })
    }
    return { itemId, expectedVersion: entry.expectedVersion }
  })
  if (new Set(items.map((entry) => entry.itemId)).size !== items.length) {
    throw new ApiException('DUPLICATE_ITEM_ID', '批量物品不能重复')
  }
  return {
    items,
    commitSummary: validateCommitSummary(input.commitSummary),
  }
}

function validateBatchDirectInput(
  input: BatchDirectOutboundInput,
): BatchDirectOutboundInput {
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50) {
    throw new ApiException(
      'INVALID_BATCH_ITEMS',
      '批量离库物品数量应为 1 至 50 个',
    )
  }
  const items = input.items.map((entry) => {
    const itemId = entry.itemId.trim()
    if (!itemId || itemId.length > 100) {
      throw new ApiException('INVALID_ITEM_ID', '物品 ID 无效')
    }
    if (!Number.isSafeInteger(entry.expectedVersion) || entry.expectedVersion < 1) {
      throw new ApiException('INVALID_VERSION', '物品版本无效', { itemId })
    }
    return { itemId, expectedVersion: entry.expectedVersion }
  })
  if (new Set(items.map((entry) => entry.itemId)).size !== items.length) {
    throw new ApiException('DUPLICATE_ITEM_ID', '批量物品不能重复')
  }
  return {
    items,
    commitSummary: validateCommitSummary(input.commitSummary),
  }
}

function validateBatchDeleteInput(
  input: BatchDeleteItemsInput,
): BatchDeleteItemsInput {
  if (!Array.isArray(input.itemIds) || input.itemIds.length < 1 || input.itemIds.length > 50) {
    throw new ApiException(
      'INVALID_BATCH_ITEMS',
      '批量删除物品数量应为 1 至 50 个',
    )
  }
  const itemIds = input.itemIds.map((value) => {
    const itemId = value.trim()
    if (!itemId || itemId.length > 100) {
      throw new ApiException('INVALID_ITEM_ID', '物品 ID 无效')
    }
    return itemId
  })
  if (new Set(itemIds).size !== itemIds.length) {
    throw new ApiException('DUPLICATE_ITEM_ID', '批量物品不能重复')
  }
  return { itemIds }
}

function validateCommitSummary(value: string): string {
  const summary = value.trim()
  if (summary.length < 1 || summary.length > 250) {
    throw new ApiException(
      'INVALID_COMMIT_SUMMARY',
      '提交梗概不能为空且不能超过 250 个字符',
    )
  }
  return summary
}

function markLabelVoid(
  label: ItemLabelRecord,
  updatedAt: string,
): ItemLabelRecord {
  const statusBeforeVoid =
    label.status === 'VOID' ? label.status_before_void : label.status
  return {
    ...label,
    status: 'VOID',
    ...(statusBeforeVoid ? { status_before_void: statusBeforeVoid } : {}),
    updated_at: updatedAt,
  }
}

function createLog(
  id: string,
  before: ItemRecord,
  after: ItemRecord,
  operatorId: string,
  actionType: ItemOperationLogRecord['action_type'],
  summary: string,
  now: string,
): ItemOperationLogRecord {
  return {
    _id: id,
    item_id: before._id,
    operator_id: operatorId,
    action_type: actionType,
    commit_summary: summary,
    version_before: before.version,
    version_after: after.version,
    created_at: now,
  }
}

function toPublicRequest(
  request: OutboundRequestRecord,
): PublicOutboundRequest {
  return {
    id: request._id,
    itemId: request.item_id,
    applicantId: request.applicant_id,
    reason: request.reason,
    status: request.status,
    createdAt: request.created_at,
    updatedAt: request.updated_at,
    ...(request.reviewer_id ? { reviewerId: request.reviewer_id } : {}),
    ...(request.review_summary
      ? { reviewComment: request.review_summary }
      : {}),
    ...(request.reviewed_at ? { reviewedAt: request.reviewed_at } : {}),
  }
}
