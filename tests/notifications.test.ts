import { describe, expect, it } from 'vitest'

import type { UserRecord } from '../cloudfunctions/api/src/membership/types'
import type {
  NotificationRecord,
  NotificationTargetStatus,
} from '../cloudfunctions/api/src/notifications/types'
import type {
  NotificationRepository,
  NotificationUnitOfWork,
} from '../cloudfunctions/api/src/notifications/repository'
import { NotificationService } from '../cloudfunctions/api/src/notifications/service'

class InMemoryNotificationRepository implements NotificationRepository {
  users = new Map<string, UserRecord>()
  notifications = new Map<string, NotificationRecord>()
  joinStatuses = new Map<string, NotificationTargetStatus>()
  outboundStatuses = new Map<string, NotificationTargetStatus>()

  async runTransaction<T>(
    operation: (unitOfWork: NotificationUnitOfWork) => Promise<T>,
  ): Promise<T> {
    const notifications = cloneMap(this.notifications)
    const result = await operation(
      new InMemoryNotificationUnitOfWork(
        this.users,
        notifications,
        this.joinStatuses,
        this.outboundStatuses,
      ),
    )
    this.notifications = notifications
    return result
  }
}

class InMemoryNotificationUnitOfWork implements NotificationUnitOfWork {
  constructor(
    private readonly users: Map<string, UserRecord>,
    private readonly notifications: Map<string, NotificationRecord>,
    private readonly joinStatuses: Map<string, NotificationTargetStatus>,
    private readonly outboundStatuses: Map<string, NotificationTargetStatus>,
  ) {}

  getUserByOpenid(openid: string): Promise<UserRecord | null> {
    return Promise.resolve(
      [...this.users.values()].find((user) => user.openid === openid) ?? null,
    )
  }

  listForRecipient(
    recipientId: string,
    limit: number,
  ): Promise<NotificationRecord[]> {
    return Promise.resolve(
      [...this.notifications.values()]
        .filter((notification) => notification.recipient_id === recipientId)
        .sort((left, right) =>
          right.created_at.localeCompare(left.created_at),
        )
        .slice(0, limit),
    )
  }

  countUnread(recipientId: string): Promise<number> {
    return Promise.resolve(
      [...this.notifications.values()].filter(
        (notification) =>
          notification.recipient_id === recipientId &&
          notification.status === 'UNREAD',
      ).length,
    )
  }

  getForRecipient(
    notificationId: string,
    recipientId: string,
  ): Promise<NotificationRecord | null> {
    const notification = this.notifications.get(notificationId)
    return Promise.resolve(
      notification?.recipient_id === recipientId
        ? structuredClone(notification)
        : null,
    )
  }

  setNotification(notification: NotificationRecord): Promise<void> {
    this.notifications.set(notification._id, structuredClone(notification))
    return Promise.resolve()
  }

  getTargetStatus(
    notification: NotificationRecord,
  ): Promise<NotificationTargetStatus> {
    const statuses =
      notification.kind === 'JOIN_REQUEST'
        ? this.joinStatuses
        : this.outboundStatuses
    return Promise.resolve(statuses.get(notification.target_id) ?? 'NOT_FOUND')
  }
}

function createUser(
  id: string,
  openid: string,
  role: UserRecord['role'],
): UserRecord {
  return {
    _id: id,
    openid,
    display_name: id,
    role,
    status: 'APPROVED',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  }
}

function createNotification(
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord {
  return {
    _id: 'notification-1',
    recipient_id: 'user-owner',
    kind: 'JOIN_REQUEST',
    title: '新的成员加入申请',
    body: '成员甲提交了加入组织申请',
    target: 'MEMBER_REVIEW',
    target_id: 'request-1',
    status: 'UNREAD',
    created_at: '2026-08-01T02:00:00.000Z',
    updated_at: '2026-08-01T02:00:00.000Z',
    ...overrides,
  }
}

function cloneMap<TValue>(source: Map<string, TValue>): Map<string, TValue> {
  return new Map(
    [...source.entries()].map(([key, value]) => [key, structuredClone(value)]),
  )
}

describe('管理员站内提醒服务', () => {
  it('只允许管理员读取提醒，并返回未读数和申请最终状态', async () => {
    const repository = new InMemoryNotificationRepository()
    repository.users.set('user-owner', createUser('user-owner', 'owner', 'OWNER'))
    repository.users.set('user-member', createUser('user-member', 'member', 'MEMBER'))
    repository.notifications.set('notification-1', createNotification())
    repository.joinStatuses.set('request-1', 'APPROVED')
    const service = new NotificationService(repository)

    await expect(service.list('owner')).resolves.toMatchObject({
      unreadCount: 1,
      items: [
        {
          id: 'notification-1',
          targetStatus: 'APPROVED',
          status: 'UNREAD',
        },
      ],
    })
    await expect(service.list('member')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('已读操作只影响当前管理员自己的提醒', async () => {
    const repository = new InMemoryNotificationRepository()
    repository.users.set('user-owner', createUser('user-owner', 'owner', 'OWNER'))
    repository.notifications.set('notification-1', createNotification())
    const service = new NotificationService(
      repository,
      () => '2026-08-01T03:00:00.000Z',
    )

    await expect(
      service.markRead('owner', 'notification-1'),
    ).resolves.toMatchObject({
      id: 'notification-1',
      status: 'READ',
      readAt: '2026-08-01T03:00:00.000Z',
    })
    expect(repository.notifications.get('notification-1')).toMatchObject({
      status: 'READ',
      read_at: '2026-08-01T03:00:00.000Z',
    })
    await expect(
      service.markRead('owner', 'notification-missing'),
    ).rejects.toMatchObject({ code: 'NOTIFICATION_NOT_FOUND' })
  })
})
