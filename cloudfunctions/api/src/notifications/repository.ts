import type { UserRecord } from '../membership/types'
import type {
  NotificationRecord,
  NotificationTargetStatus,
} from './types'

export interface NotificationUnitOfWork {
  getUserByOpenid(openid: string): Promise<UserRecord | null>
  listForRecipient(
    recipientId: string,
    limit: number,
  ): Promise<NotificationRecord[]>
  countUnread(recipientId: string): Promise<number>
  getForRecipient(
    notificationId: string,
    recipientId: string,
  ): Promise<NotificationRecord | null>
  setNotification(notification: NotificationRecord): Promise<void>
  getTargetStatus(
    notification: NotificationRecord,
  ): Promise<NotificationTargetStatus>
}

export interface NotificationRepository {
  runTransaction<T>(
    operation: (unitOfWork: NotificationUnitOfWork) => Promise<T>,
  ): Promise<T>
}
