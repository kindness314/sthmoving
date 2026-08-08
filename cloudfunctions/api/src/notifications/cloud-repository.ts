import cloud from 'wx-server-sdk'

import type { UserRecord } from '../membership/types'
import type {
  NotificationRepository,
  NotificationUnitOfWork,
} from './repository'
import type {
  NotificationRecord,
  NotificationTargetStatus,
} from './types'

interface QueryResult {
  data: unknown[]
  total?: number
}

interface DocumentReference {
  set(options: { data: object }): Promise<unknown>
}

interface Query {
  where(condition: object): Query
  limit(max: number): Query
  count(): Promise<{ total: number }>
  get(): Promise<QueryResult>
}

interface Collection extends Query {
  doc(id: string): DocumentReference
}

interface TransactionDatabase {
  collection(name: string): Collection
  runTransaction<T>(
    operation: (transaction: TransactionDatabase) => Promise<T>,
  ): Promise<T>
}

class CloudNotificationUnitOfWork implements NotificationUnitOfWork {
  constructor(private readonly database: TransactionDatabase) {}

  getUserByOpenid(openid: string): Promise<UserRecord | null> {
    return this.getFirst<UserRecord>('users', { openid })
  }

  async listForRecipient(
    recipientId: string,
    limit: number,
  ): Promise<NotificationRecord[]> {
    const result = await this.database
      .collection('notifications')
      .where({ recipient_id: recipientId })
      .limit(limit)
      .get()
    return (result.data as NotificationRecord[]).sort(sortByCreatedAt)
  }

  async countUnread(recipientId: string): Promise<number> {
    const result = await this.database
      .collection('notifications')
      .where({ recipient_id: recipientId, status: 'UNREAD' })
      .count()
    return result.total
  }

  getForRecipient(
    notificationId: string,
    recipientId: string,
  ): Promise<NotificationRecord | null> {
    return this.getFirst<NotificationRecord>('notifications', {
      _id: notificationId,
      recipient_id: recipientId,
    })
  }

  async setNotification(notification: NotificationRecord): Promise<void> {
    const { _id, ...data } = notification
    await this.database.collection('notifications').doc(_id).set({ data })
  }

  async getTargetStatus(
    notification: NotificationRecord,
  ): Promise<NotificationTargetStatus> {
    const collection =
      notification.kind === 'JOIN_REQUEST'
        ? 'join_requests'
        : 'outbound_requests'
    const record = await this.getFirst<{ status?: unknown }>(collection, {
      _id: notification.target_id,
    })
    if (
      record?.status === 'PENDING' ||
      record?.status === 'APPROVED' ||
      record?.status === 'REJECTED'
    ) {
      return record.status
    }
    return 'NOT_FOUND'
  }

  private async getFirst<TRecord>(
    collection: string,
    condition: object,
  ): Promise<TRecord | null> {
    const result = await this.database
      .collection(collection)
      .where(condition)
      .limit(1)
      .get()
    return (result.data[0] as TRecord | undefined) ?? null
  }
}

export class CloudNotificationRepository implements NotificationRepository {
  private readonly database = cloud.database() as unknown as TransactionDatabase

  runTransaction<T>(
    operation: (unitOfWork: NotificationUnitOfWork) => Promise<T>,
  ): Promise<T> {
    return this.database.runTransaction((transaction) =>
      operation(new CloudNotificationUnitOfWork(transaction)),
    )
  }
}

function sortByCreatedAt(
  left: NotificationRecord,
  right: NotificationRecord,
): number {
  return (
    right.created_at.localeCompare(left.created_at) ||
    right._id.localeCompare(left._id)
  )
}
