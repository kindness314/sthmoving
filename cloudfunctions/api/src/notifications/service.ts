import { ApiException } from '../errors'
import type {
  NotificationRepository,
  NotificationUnitOfWork,
} from './repository'
import type {
  NotificationRecord,
  PublicNotification,
  PublicNotificationList,
} from './types'

export class NotificationService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async list(openid: string): Promise<PublicNotificationList> {
    return this.repository.runTransaction(async (unitOfWork) => {
      const reviewer = await unitOfWork.getUserByOpenid(openid)
      requireReviewer(reviewer, openid)

      const records = await unitOfWork.listForRecipient(reviewer._id, 50)
      const items: PublicNotification[] = []
      for (const record of records) {
        items.push(await this.toPublicNotification(unitOfWork, record))
      }
      return {
        items,
        unreadCount: await unitOfWork.countUnread(reviewer._id),
      }
    })
  }

  async markRead(
    openid: string,
    notificationIdInput: string,
  ): Promise<PublicNotification> {
    const notificationId = notificationIdInput.trim()
    if (!notificationId || notificationId.length > 160) {
      throw new ApiException('INVALID_NOTIFICATION_ID', '提醒 ID 无效')
    }

    return this.repository.runTransaction(async (unitOfWork) => {
      const reviewer = await unitOfWork.getUserByOpenid(openid)
      requireReviewer(reviewer, openid)

      const record = await unitOfWork.getForRecipient(
        notificationId,
        reviewer._id,
      )
      if (!record) {
        throw new ApiException('NOTIFICATION_NOT_FOUND', '提醒不存在')
      }

      if (record.status === 'UNREAD') {
        const now = this.now()
        await unitOfWork.setNotification({
          ...record,
          status: 'READ',
          read_at: now,
          updated_at: now,
        })
        return this.toPublicNotification(unitOfWork, {
          ...record,
          status: 'READ',
          read_at: now,
          updated_at: now,
        })
      }
      return this.toPublicNotification(unitOfWork, record)
    })
  }

  private async toPublicNotification(
    unitOfWork: NotificationUnitOfWork,
    record: NotificationRecord,
  ): Promise<PublicNotification> {
    const targetStatus = await unitOfWork.getTargetStatus(record)
    return {
      id: record._id,
      kind: record.kind,
      title: record.title,
      body: record.body,
      target: record.target,
      targetId: record.target_id,
      status: record.status,
      targetStatus,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      ...(record.read_at ? { readAt: record.read_at } : {}),
    }
  }
}

function requireReviewer(
  user: Awaited<ReturnType<NotificationUnitOfWork['getUserByOpenid']>>,
  openid: string,
): asserts user is NonNullable<typeof user> {
  if (!user || user.openid !== openid) {
    throw new ApiException('UNAUTHENTICATED', '当前微信用户尚未建立账号')
  }
  if (user.status !== 'APPROVED') {
    throw new ApiException('ACCOUNT_NOT_ACTIVE', '当前账号尚未通过审核')
  }
  if (
    user.role !== 'ADMIN' &&
    user.role !== 'MANAGER' &&
    user.role !== 'OWNER'
  ) {
    throw new ApiException('FORBIDDEN', '只有管理员或所有者可以查看提醒')
  }
}
