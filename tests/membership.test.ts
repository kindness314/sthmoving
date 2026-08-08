import { describe, expect, it } from 'vitest'

import type {
  MembershipRepository,
  MembershipUnitOfWork,
} from '../cloudfunctions/api/src/membership/repository'
import { MembershipService } from '../cloudfunctions/api/src/membership/service'
import type {
  JoinRequestRecord,
  UserRecord,
} from '../cloudfunctions/api/src/membership/types'
import type { NotificationRecord } from '../cloudfunctions/api/src/notifications/types'

class InMemoryMembershipRepository implements MembershipRepository {
  users = new Map<string, UserRecord>()
  requests = new Map<string, JoinRequestRecord>()
  notifications = new Map<string, NotificationRecord>()

  async runTransaction<T>(
    operation: (unitOfWork: MembershipUnitOfWork) => Promise<T>,
  ): Promise<T> {
    const users = cloneMap(this.users)
    const requests = cloneMap(this.requests)
    const notifications = cloneMap(this.notifications)
    const result = await operation(
      new InMemoryUnitOfWork(users, requests, notifications),
    )
    this.users = users
    this.requests = requests
    this.notifications = notifications
    return result
  }
}

class InMemoryUnitOfWork implements MembershipUnitOfWork {
  constructor(
    private readonly users: Map<string, UserRecord>,
    private readonly requests: Map<string, JoinRequestRecord>,
    private readonly notifications: Map<string, NotificationRecord>,
  ) {}

  getUser(userId: string): Promise<UserRecord | null> {
    return Promise.resolve(this.users.get(userId) ?? null)
  }

  setUser(user: UserRecord): Promise<void> {
    this.users.set(user._id, structuredClone(user))
    return Promise.resolve()
  }

  countOwners(): Promise<number> {
    return Promise.resolve(
      [...this.users.values()].filter((user) => user.role === 'OWNER').length,
    )
  }

  countManagers(): Promise<number> {
    return Promise.resolve(
      [...this.users.values()].filter(
        (user) => user.role === 'MANAGER' && user.status === 'APPROVED',
      ).length,
    )
  }

  findPendingJoinRequest(
    applicantId: string,
  ): Promise<JoinRequestRecord | null> {
    return Promise.resolve(
      [...this.requests.values()].find(
        (request) =>
          request.applicant_id === applicantId &&
          request.status === 'PENDING',
      ) ?? null,
    )
  }

  getJoinRequest(
    requestId: string,
  ): Promise<JoinRequestRecord | null> {
    return Promise.resolve(this.requests.get(requestId) ?? null)
  }

  setJoinRequest(request: JoinRequestRecord): Promise<void> {
    this.requests.set(request._id, structuredClone(request))
    return Promise.resolve()
  }

  listPendingJoinRequests(
    limit: number,
  ): Promise<JoinRequestRecord[]> {
    return Promise.resolve(
      [...this.requests.values()]
        .filter((request) => request.status === 'PENDING')
        .sort((left, right) =>
          right.created_at.localeCompare(left.created_at),
        )
      .slice(0, limit),
    )
  }

  listUsers(limit: number): Promise<UserRecord[]> {
    return Promise.resolve([...this.users.values()].slice(0, limit))
  }

  listActiveReviewers(): Promise<UserRecord[]> {
    return Promise.resolve(
      [...this.users.values()].filter(
        (user) =>
          user.status === 'APPROVED' &&
          (user.role === 'ADMIN' || user.role === 'MANAGER' || user.role === 'OWNER'),
      ),
    )
  }

  setNotification(notification: NotificationRecord): Promise<void> {
    this.notifications.set(notification._id, structuredClone(notification))
    return Promise.resolve()
  }
}

function createService(repository: InMemoryMembershipRepository) {
  let requestSequence = 0
  return new MembershipService(
    repository,
    () => '2026-07-29T13:00:00.000Z',
    () => `request-${++requestSequence}`,
  )
}

function cloneMap<TValue>(source: Map<string, TValue>): Map<string, TValue> {
  return new Map(
    [...source.entries()].map(([key, value]) => [
      key,
      structuredClone(value),
    ]),
  )
}

async function expectApiCode(
  operation: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(operation).rejects.toMatchObject({ code })
}

describe('成员身份服务', () => {
  it('首次登录建立唯一账号但不自动提交加入申请', async () => {
    const repository = new InMemoryMembershipRepository()
    const service = createService(repository)

    const first = await service.login('new-user-openid')
    const second = await service.login('new-user-openid')

    expect(first.accessState).toBe('UNAPPLIED')
    expect(second.user.id).toBe(first.user.id)
    expect(repository.users.size).toBe(1)
    expect(repository.requests.size).toBe(0)
  })

  it('拒绝后允许重新申请，但不允许同时存在两条待审核申请', async () => {
    const repository = new InMemoryMembershipRepository()
    const service = createService(repository)

    await service.bootstrapOwner('owner-openid')
    const first = await service.submitJoinRequest(
      'member-openid',
      '成员甲',
    )
    expect(first.accessState).toBe('PENDING')
    expect(repository.notifications.size).toBe(0)
    await expectApiCode(
      service.submitJoinRequest('member-openid', '成员甲'),
      'JOIN_REQUEST_PENDING',
    )

    const [request] =
      await service.listPendingJoinRequests('owner-openid')
    expect(request).toBeDefined()
    await service.reviewJoinRequest('owner-openid', {
      requestId: request!.id,
      decision: 'REJECT',
      comment: '当前暂不符合加入条件',
    })
    await expect(service.login('member-openid')).resolves.toMatchObject({
      accessState: 'REJECTED',
    })

    await expect(
      service.submitJoinRequest('member-openid', '成员甲（再次申请）'),
    ).resolves.toMatchObject({ accessState: 'PENDING' })
    expect(repository.requests.size).toBe(2)
  })

  it('拒绝加入申请必须填写原因，并拒绝审核状态已变化的申请人', async () => {
    const repository = new InMemoryMembershipRepository()
    const service = createService(repository)

    await service.bootstrapOwner('owner-openid')
    await service.submitJoinRequest('member-openid', '成员')
    const [request] = await service.listPendingJoinRequests('owner-openid')
    expect(request).toBeDefined()

    await expectApiCode(
      service.reviewJoinRequest('owner-openid', {
        requestId: request!.id,
        decision: 'REJECT',
      }),
      'INVALID_REVIEW_COMMENT',
    )

    const member = [...repository.users.values()].find(
      (user) => user.openid === 'member-openid',
    )
    expect(member).toBeDefined()
    repository.users.set(member!._id, {
      ...member!,
      status: 'DISABLED',
    })
    await expectApiCode(
      service.reviewJoinRequest('owner-openid', {
        requestId: request!.id,
        decision: 'APPROVE',
      }),
      'JOIN_APPLICANT_STATE_CONFLICT',
    )
  })

  it('管理员可以通过申请，普通成员不能调用审核接口', async () => {
    const repository = new InMemoryMembershipRepository()
    const service = createService(repository)

    const owner = await service.bootstrapOwner('owner-openid')
    expect(owner.user.role).toBe('OWNER')
    await service.submitJoinRequest('member-openid', '成员乙')

    await expectApiCode(
      service.listPendingJoinRequests('member-openid'),
      'ACCOUNT_NOT_ACTIVE',
    )

    const [request] =
      await service.listPendingJoinRequests('owner-openid')
    await service.reviewJoinRequest('owner-openid', {
      requestId: request!.id,
      decision: 'APPROVE',
    })

    const member = await service.login('member-openid')
    expect(member.accessState).toBe('APPROVED')
    expect(member.user.role).toBe('MEMBER')
    await expectApiCode(
      service.listPendingJoinRequests('member-openid'),
      'FORBIDDEN',
    )
  })

  it('首位所有者初始化成功后关闭入口', async () => {
    const repository = new InMemoryMembershipRepository()
    const service = createService(repository)

    await service.bootstrapOwner('first-owner-openid')
    await expectApiCode(
      service.bootstrapOwner('second-owner-openid'),
      'OWNER_BOOTSTRAP_CLOSED',
    )
    expect(repository.users.size).toBe(1)
  })

  it('停用账号不能重新申请或调用审核接口', async () => {
    const repository = new InMemoryMembershipRepository()
    const service = createService(repository)
    const session = await service.login('disabled-openid')
    const user = repository.users.get(session.user.id)
    expect(user).toBeDefined()
    repository.users.set(session.user.id, {
      ...user!,
      status: 'DISABLED',
    })

    await expect(service.login('disabled-openid')).resolves.toMatchObject({
      accessState: 'DISABLED',
    })
    await expectApiCode(
      service.submitJoinRequest('disabled-openid', '停用成员'),
      'ACCOUNT_DISABLED',
    )
    await expectApiCode(
      service.listPendingJoinRequests('disabled-openid'),
      'ACCOUNT_NOT_ACTIVE',
    )
  })
})
