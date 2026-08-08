import type { UserRecord } from '../membership/types'
import type { ItemLabelRecord } from '../labels/types'
import type {
  ItemOperationLogRecord,
  ItemRecord,
} from '../items/types'
import type { OutboundRequestRecord } from './types'
import type { NotificationRecord } from '../notifications/types'

export interface OutboundUnitOfWork {
  getUserByOpenid(openid: string): Promise<UserRecord | null>
  getUser(userId: string): Promise<UserRecord | null>
  getItem(itemId: string): Promise<ItemRecord | null>
  getRequest(requestId: string): Promise<OutboundRequestRecord | null>
  findPendingRequest(itemId: string): Promise<OutboundRequestRecord | null>
  listPendingRequests(limit: number): Promise<OutboundRequestRecord[]>
  listRequestsByApplicant(
    applicantId: string,
    limit: number,
  ): Promise<OutboundRequestRecord[]>
  listActiveReviewers(): Promise<UserRecord[]>
  setNotification(notification: NotificationRecord): Promise<void>
  getLabelByItemId(itemId: string): Promise<ItemLabelRecord | null>
  setItem(item: ItemRecord): Promise<void>
  deleteItem(itemId: string): Promise<void>
  setRequest(request: OutboundRequestRecord): Promise<void>
  setLabel(label: ItemLabelRecord): Promise<void>
  setOperationLog(log: ItemOperationLogRecord): Promise<void>
}

export interface OutboundRepository {
  runTransaction<T>(
    operation: (unitOfWork: OutboundUnitOfWork) => Promise<T>,
  ): Promise<T>
}
