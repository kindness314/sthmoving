import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import type {
  MembershipRepository,
  MembershipUnitOfWork,
} from '../cloudfunctions/api/src/membership/repository'
import type { MemberRoleInput } from '../cloudfunctions/api/src/membership/service'
import { MembershipService } from '../cloudfunctions/api/src/membership/service'
import type {
  JoinRequestRecord,
  UserRecord,
} from '../cloudfunctions/api/src/membership/types'

class InMemoryMembershipRepository implements MembershipRepository {
  users = new Map<string, UserRecord>()
  requests = new Map<string, JoinRequestRecord>()

  async runTransaction<T>(
    operation: (unitOfWork: MembershipUnitOfWork) => Promise<T>,
  ): Promise<T> {
    const users = cloneMap(this.users)
    const requests = cloneMap(this.requests)
    const result = await operation(
      new InMemoryUnitOfWork(users, requests),
    )
    this.users = users
    this.requests = requests
    return result
  }
}

class InMemoryUnitOfWork implements MembershipUnitOfWork {
  constructor(
    private readonly users: Map<string, UserRecord>,
    private readonly requests: Map<string, JoinRequestRecord>,
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

}

function userIdOf(openid: string): string {
  return createHash('sha256').update(openid).digest('hex').slice(0, 32)
}

function createUser(
  openid: string,
  role: UserRecord['role'] = 'MEMBER',
  status: UserRecord['status'] = 'APPROVED',
): UserRecord {
  return {
    _id: userIdOf(openid),
    openid,
    display_name: openid,
    role,
    status,
    created_at: '2026-07-29T00:00:00.000Z',
    updated_at: '2026-07-29T00:00:00.000Z',
  }
}

function seedUser(
  repository: InMemoryMembershipRepository,
  openid: string,
  role: UserRecord['role'] = 'MEMBER',
  status: UserRecord['status'] = 'APPROVED',
): UserRecord {
  const user = createUser(openid, role, status)
  repository.users.set(user._id, user)
  return user
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

    const first = await service.login(userIdOf('new-user-openid'), 'new-user-openid')
    const second = await service.login(userIdOf('new-user-openid'), 'new-user-openid')

    expect(first.accessState).toBe('UNAPPLIED')
    expect(second.user.id).toBe(first.user.id)
    expect(repository.users.size).toBe(1)
    expect(repository.requests.size).toBe(0)
  })

  it('拒绝后允许重新申请，但不允许同时存在两条待审核申请', async () => {
    const repository = new InMemoryMembershipRepository()
    const service = createService(repository)

    await service.bootstrapOwner(userIdOf('owner-openid'), 'owner-openid')
    const first = await service.submitJoinRequest(
      userIdOf('member-openid'),
      'member-openid',
      '成员甲',
    )
    expect(first.accessState).toBe('PENDING')
    await expectApiCode(
      service.submitJoinRequest(userIdOf('member-openid'), 'member-openid', '成员甲'),
      'JOIN_REQUEST_PENDING',
    )

    const [request] =
      await service.listPendingJoinRequests(userIdOf('owner-openid'))
    expect(request).toBeDefined()
    await service.reviewJoinRequest(userIdOf('owner-openid'), {
      requestId: request!.id,
      decision: 'REJECT',
      comment: '当前暂不符合加入条件',
    })
    await expect(service.login(userIdOf('member-openid'), 'member-openid')).resolves.toMatchObject({
      accessState: 'REJECTED',
    })

    await expect(
      service.submitJoinRequest(userIdOf('member-openid'), 'member-openid', '成员甲（再次申请）'),
    ).resolves.toMatchObject({ accessState: 'PENDING' })
    expect(repository.requests.size).toBe(2)
  })

  it('拒绝加入申请必须填写原因，并拒绝审核状态已变化的申请人', async () => {
    const repository = new InMemoryMembershipRepository()
    const service = createService(repository)

    await service.bootstrapOwner(userIdOf('owner-openid'), 'owner-openid')
    await service.submitJoinRequest(userIdOf('member-openid'), 'member-openid', '成员')
    const [request] = await service.listPendingJoinRequests(userIdOf('owner-openid'))
    expect(request).toBeDefined()

    await expectApiCode(
      service.reviewJoinRequest(userIdOf('owner-openid'), {
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
      service.reviewJoinRequest(userIdOf('owner-openid'), {
        requestId: request!.id,
        decision: 'APPROVE',
      }),
      'JOIN_APPLICANT_STATE_CONFLICT',
    )
  })

  it('管理员可以通过申请，普通成员不能调用审核接口', async () => {
    const repository = new InMemoryMembershipRepository()
    const service = createService(repository)

    const owner = await service.bootstrapOwner(userIdOf('owner-openid'), 'owner-openid')
    expect(owner.user.role).toBe('OWNER')
    await service.submitJoinRequest(userIdOf('member-openid'), 'member-openid', '成员乙')

    await expectApiCode(
      service.listPendingJoinRequests(userIdOf('member-openid')),
      'ACCOUNT_NOT_ACTIVE',
    )

    const [request] =
      await service.listPendingJoinRequests(userIdOf('owner-openid'))
    await service.reviewJoinRequest(userIdOf('owner-openid'), {
      requestId: request!.id,
      decision: 'APPROVE',
    })

    const member = await service.login(userIdOf('member-openid'), 'member-openid')
    expect(member.accessState).toBe('APPROVED')
    expect(member.user.role).toBe('MEMBER')
    await expectApiCode(
      service.listPendingJoinRequests(userIdOf('member-openid')),
      'FORBIDDEN',
    )
  })

  it('首位所有者初始化成功后关闭入口', async () => {
    const repository = new InMemoryMembershipRepository()
    const service = createService(repository)

    await service.bootstrapOwner(userIdOf('first-owner-openid'), 'first-owner-openid')
    await expectApiCode(
      service.bootstrapOwner(userIdOf('second-owner-openid'), 'second-owner-openid'),
      'OWNER_BOOTSTRAP_CLOSED',
    )
    expect(repository.users.size).toBe(1)
  })

  it('停用账号不能重新申请或调用审核接口', async () => {
    const repository = new InMemoryMembershipRepository()
    const service = createService(repository)
    const session = await service.login(userIdOf('disabled-openid'), 'disabled-openid')
    const user = repository.users.get(session.user.id)
    expect(user).toBeDefined()
    repository.users.set(session.user.id, {
      ...user!,
      status: 'DISABLED',
    })

    await expect(service.login(userIdOf('disabled-openid'), 'disabled-openid')).resolves.toMatchObject({
      accessState: 'DISABLED',
    })
    await expectApiCode(
      service.submitJoinRequest(userIdOf('disabled-openid'), 'disabled-openid', '停用成员'),
      'ACCOUNT_DISABLED',
    )
    await expectApiCode(
      service.listPendingJoinRequests(userIdOf('disabled-openid')),
      'ACCOUNT_NOT_ACTIVE',
    )
  })

  it('已加入成员可以更新自己的昵称、头像、性别和主题', async () => {
    const repository = new InMemoryMembershipRepository()
    const service = createService(repository)
    const owner = await service.bootstrapOwner(userIdOf('owner-openid'), 'owner-openid')

    const avatarUrl = `cloud://example-env.bucket/avatars/${owner.user.id}/owner.jpg`
    const updated = await service.updateProfile(userIdOf('owner-openid'), {
      displayName: '仓库负责人',
      avatarUrl,
      gender: 'FEMALE',
      theme: 'RUST',
    })

    expect(updated).toMatchObject({
      id: owner.user.id,
      displayName: '仓库负责人',
      avatarUrl,
      gender: 'FEMALE',
      theme: 'RUST',
      joinedAt: '2026-07-29T13:00:00.000Z',
    })
  })

  it('未通过审核的账号不能更新资料，并拒绝空更新和无效字段', async () => {
    const repository = new InMemoryMembershipRepository()
    const service = createService(repository)
    await service.login(userIdOf('pending-openid'), 'pending-openid')
    await expectApiCode(
      service.updateProfile(userIdOf('pending-openid'), { displayName: '待审核用户' }),
      'ACCOUNT_NOT_ACTIVE',
    )

    await service.bootstrapOwner(userIdOf('owner-openid'), 'owner-openid')
    await expectApiCode(service.updateProfile(userIdOf('owner-openid'), {}), 'EMPTY_PROFILE_UPDATE')
    await expectApiCode(
      service.updateProfile(userIdOf('owner-openid'), { avatarUrl: 'https://example.com/avatar.jpg' }),
      'INVALID_AVATAR_URL',
    )
    await expectApiCode(
      service.updateProfile(userIdOf('owner-openid'), { avatarUrl: 'cloud://example-env.bucket/avatars/another-user/avatar.jpg' }),
      'INVALID_AVATAR_URL',
    )
  })

  it('管理权限角色可以查看成员名单且不返回 openid，普通成员和未通过审核的账号不能查看', async () => {
    const repository = new InMemoryMembershipRepository()
    const service = createService(repository)
    const owner = seedUser(repository, 'owner-openid', 'OWNER')
    const manager = seedUser(repository, 'manager-openid', 'MANAGER')
    const admin = seedUser(repository, 'admin-openid', 'ADMIN')
    const member = seedUser(repository, 'member-openid', 'MEMBER')
    const pending = seedUser(repository, 'pending-openid', 'MEMBER', 'PENDING')

    const members = await service.listMembers(userIdOf('admin-openid'))

    expect(members.map((item) => item.id).sort()).toEqual(
      [owner._id, manager._id, admin._id, member._id, pending._id].sort(),
    )
    expect(members.some((item) => 'openid' in item)).toBe(false)
    expect(members.find((item) => item.id === member._id)).toMatchObject({
      displayName: 'member-openid',
      role: 'MEMBER',
      status: 'APPROVED',
      gender: 'UNKNOWN',
      theme: 'NAVY',
    })

    await expect(service.listMembers(userIdOf('manager-openid'))).resolves.toHaveLength(5)
    await expect(service.listMembers(userIdOf('owner-openid'))).resolves.toHaveLength(5)
    await expectApiCode(service.listMembers(userIdOf('member-openid')), 'FORBIDDEN')
    await expectApiCode(service.listMembers(userIdOf('pending-openid')), 'ACCOUNT_NOT_ACTIVE')
    await expectApiCode(service.listMembers(userIdOf('unknown-openid')), 'UNAUTHENTICATED')
  })

  it('管理员可以停用普通成员，但不能停用自己、所有者、实际管理者或未通过审核的成员', async () => {
    const repository = new InMemoryMembershipRepository()
    const service = createService(repository)
    const owner = seedUser(repository, 'owner-openid', 'OWNER')
    const manager = seedUser(repository, 'manager-openid', 'MANAGER')
    const admin = seedUser(repository, 'admin-openid', 'ADMIN')
    const member = seedUser(repository, 'member-openid', 'MEMBER')
    const pending = seedUser(repository, 'pending-openid', 'MEMBER', 'PENDING')

    await expect(service.disableMember(userIdOf('admin-openid'), member._id)).resolves.toMatchObject({
      id: member._id,
      status: 'DISABLED',
      reviewedBy: admin._id,
      reviewedAt: '2026-07-29T13:00:00.000Z',
    })
    expect(repository.users.get(member._id)?.status).toBe('DISABLED')

    await expectApiCode(
      service.disableMember(userIdOf('admin-openid'), admin._id),
      'SELF_MEMBER_DISABLE_FORBIDDEN',
    )
    await expectApiCode(
      service.disableMember(userIdOf('owner-openid'), owner._id),
      'SELF_MEMBER_DISABLE_FORBIDDEN',
    )
    await expectApiCode(
      service.disableMember(userIdOf('admin-openid'), owner._id),
      'ROLE_CHANGE_FORBIDDEN',
    )
    await expectApiCode(
      service.disableMember(userIdOf('admin-openid'), manager._id),
      'ROLE_CHANGE_FORBIDDEN',
    )
    await expectApiCode(
      service.disableMember(userIdOf('owner-openid'), manager._id),
      'ROLE_CHANGE_FORBIDDEN',
    )
    await expectApiCode(
      service.disableMember(userIdOf('admin-openid'), pending._id),
      'MEMBER_STATUS_INVALID',
    )
    await expectApiCode(
      service.disableMember(userIdOf('admin-openid'), member._id),
      'MEMBER_STATUS_INVALID',
    )
    await expectApiCode(
      service.disableMember(userIdOf('admin-openid'), 'missing-user'),
      'USER_NOT_FOUND',
    )
    await expectApiCode(service.disableMember(userIdOf('admin-openid'), '  '), 'INVALID_USER_ID')
    await expectApiCode(
      service.disableMember(userIdOf('member-openid'), pending._id),
      'ACCOUNT_NOT_ACTIVE',
    )
  })

  it('停用管理员需要实际管理者或所有者权限，普通成员不能管理成员', async () => {
    const repository = new InMemoryMembershipRepository()
    const service = createService(repository)
    const owner = seedUser(repository, 'owner-openid', 'OWNER')
    const manager = seedUser(repository, 'manager-openid', 'MANAGER')
    seedUser(repository, 'admin-openid', 'ADMIN')
    seedUser(repository, 'member-openid', 'MEMBER')
    const managerTarget = seedUser(repository, 'manager-target-openid', 'ADMIN')
    const ownerTarget = seedUser(repository, 'owner-target-openid', 'ADMIN')

    await expectApiCode(
      service.disableMember(userIdOf('admin-openid'), managerTarget._id),
      'FORBIDDEN',
    )
    await expectApiCode(
      service.disableMember(userIdOf('member-openid'), managerTarget._id),
      'FORBIDDEN',
    )

    await expect(
      service.disableMember(userIdOf('manager-openid'), managerTarget._id),
    ).resolves.toMatchObject({
      id: managerTarget._id,
      status: 'DISABLED',
      reviewedBy: manager._id,
    })
    await expect(
      service.disableMember(userIdOf('owner-openid'), ownerTarget._id),
    ).resolves.toMatchObject({
      id: ownerTarget._id,
      status: 'DISABLED',
      reviewedBy: owner._id,
    })
  })

  it('实际管理者和所有者可以任免管理员，但不能调整所有者、实际管理者和未通过审核的成员', async () => {
    const repository = new InMemoryMembershipRepository()
    const service = createService(repository)
    const owner = seedUser(repository, 'owner-openid', 'OWNER')
    const manager = seedUser(repository, 'manager-openid', 'MANAGER')
    const admin = seedUser(repository, 'admin-openid', 'ADMIN')
    const member = seedUser(repository, 'member-openid', 'MEMBER')
    seedUser(repository, 'other-admin-openid', 'ADMIN')
    const pending = seedUser(repository, 'pending-openid', 'MEMBER', 'PENDING')
    const disabled = seedUser(repository, 'disabled-openid', 'MEMBER', 'DISABLED')

    await expect(
      service.setAdminRole(userIdOf('manager-openid'), { userId: member._id, role: 'ADMIN' }),
    ).resolves.toMatchObject({
      id: member._id,
      role: 'ADMIN',
      reviewedBy: manager._id,
      reviewedAt: '2026-07-29T13:00:00.000Z',
    })
    await expect(
      service.setAdminRole(userIdOf('owner-openid'), { userId: admin._id, role: 'MEMBER' }),
    ).resolves.toMatchObject({
      id: admin._id,
      role: 'MEMBER',
      reviewedBy: owner._id,
    })
    expect(repository.users.get(member._id)?.role).toBe('ADMIN')
    expect(repository.users.get(admin._id)?.role).toBe('MEMBER')

    await expectApiCode(
      service.setAdminRole(userIdOf('other-admin-openid'), { userId: member._id, role: 'MEMBER' }),
      'FORBIDDEN',
    )
    await expectApiCode(
      service.setAdminRole(userIdOf('owner-openid'), { userId: owner._id, role: 'ADMIN' }),
      'ROLE_CHANGE_FORBIDDEN',
    )
    await expectApiCode(
      service.setAdminRole(userIdOf('owner-openid'), { userId: manager._id, role: 'ADMIN' }),
      'ROLE_CHANGE_FORBIDDEN',
    )
    await expectApiCode(
      service.setAdminRole(userIdOf('owner-openid'), { userId: pending._id, role: 'ADMIN' }),
      'ROLE_CHANGE_FORBIDDEN',
    )
    await expectApiCode(
      service.setAdminRole(userIdOf('owner-openid'), { userId: disabled._id, role: 'ADMIN' }),
      'ROLE_CHANGE_FORBIDDEN',
    )
    await expectApiCode(
      service.setAdminRole(userIdOf('owner-openid'), { userId: 'missing-user', role: 'ADMIN' }),
      'USER_NOT_FOUND',
    )
    await expectApiCode(
      service.setAdminRole(userIdOf('owner-openid'), { userId: ' ', role: 'ADMIN' }),
      'INVALID_USER_ID',
    )
    await expectApiCode(
      service.setAdminRole(userIdOf('owner-openid'), {
        userId: member._id,
        role: 'MANAGER' as MemberRoleInput['role'],
      }),
      'INVALID_ROLE',
    )
  })

  it('只有所有者可以任命实际管理者，且必须从已通过审核的管理员中任命', async () => {
    const repository = new InMemoryMembershipRepository()
    const service = createService(repository)
    const owner = seedUser(repository, 'owner-openid', 'OWNER')
    const manager = seedUser(repository, 'manager-openid', 'MANAGER')
    const admin = seedUser(repository, 'admin-openid', 'ADMIN')
    const member = seedUser(repository, 'member-openid', 'MEMBER')
    const pendingAdmin = seedUser(repository, 'pending-admin-openid', 'ADMIN', 'PENDING')

    await expectApiCode(service.appointManager(userIdOf('manager-openid'), admin._id), 'FORBIDDEN')
    await expectApiCode(service.appointManager(userIdOf('admin-openid'), admin._id), 'FORBIDDEN')
    await expectApiCode(service.appointManager(userIdOf('member-openid'), admin._id), 'FORBIDDEN')
    await expectApiCode(
      service.appointManager(userIdOf('owner-openid'), member._id),
      'MANAGER_TARGET_INVALID',
    )
    await expectApiCode(
      service.appointManager(userIdOf('owner-openid'), pendingAdmin._id),
      'MANAGER_TARGET_INVALID',
    )
    await expectApiCode(
      service.appointManager(userIdOf('owner-openid'), manager._id),
      'MANAGER_TARGET_INVALID',
    )
    await expectApiCode(service.appointManager(userIdOf('owner-openid'), 'missing-user'), 'USER_NOT_FOUND')
    await expectApiCode(service.appointManager(userIdOf('owner-openid'), ' '), 'INVALID_USER_ID')

    await expect(service.appointManager(userIdOf('owner-openid'), admin._id)).resolves.toMatchObject({
      id: admin._id,
      role: 'MANAGER',
      reviewedBy: owner._id,
      reviewedAt: '2026-07-29T13:00:00.000Z',
    })
    expect(repository.users.get(admin._id)?.role).toBe('MANAGER')
    expect(repository.users.get(manager._id)?.role).toBe('MANAGER')
  })

  it('所有者免去实际管理者时系统至少保留一名有效实际管理者', async () => {
    const repository = new InMemoryMembershipRepository()
    const service = createService(repository)
    const owner = seedUser(repository, 'owner-openid', 'OWNER')
    const manager = seedUser(repository, 'manager-openid', 'MANAGER')
    const disabledManager = seedUser(
      repository,
      'disabled-manager-openid',
      'MANAGER',
      'DISABLED',
    )
    const admin = seedUser(repository, 'admin-openid', 'ADMIN')
    const member = seedUser(repository, 'member-openid', 'MEMBER')

    await expectApiCode(
      service.removeManager(userIdOf('owner-openid'), manager._id),
      'LAST_MANAGER_FORBIDDEN',
    )
    expect(repository.users.get(manager._id)?.role).toBe('MANAGER')

    await expectApiCode(
      service.removeManager(userIdOf('owner-openid'), disabledManager._id),
      'MANAGER_TARGET_INVALID',
    )
    await expectApiCode(
      service.removeManager(userIdOf('owner-openid'), admin._id),
      'MANAGER_TARGET_INVALID',
    )
    await expectApiCode(
      service.removeManager(userIdOf('owner-openid'), member._id),
      'MANAGER_TARGET_INVALID',
    )
    await expectApiCode(service.removeManager(userIdOf('manager-openid'), manager._id), 'FORBIDDEN')
    await expectApiCode(service.removeManager(userIdOf('admin-openid'), manager._id), 'FORBIDDEN')
    await expectApiCode(service.removeManager(userIdOf('owner-openid'), 'missing-user'), 'USER_NOT_FOUND')

    await service.appointManager(userIdOf('owner-openid'), admin._id)
    await expect(service.removeManager(userIdOf('owner-openid'), manager._id)).resolves.toMatchObject({
      id: manager._id,
      role: 'ADMIN',
      reviewedBy: owner._id,
      reviewedAt: '2026-07-29T13:00:00.000Z',
    })
    expect(repository.users.get(manager._id)?.role).toBe('ADMIN')

    await expectApiCode(
      service.removeManager(userIdOf('owner-openid'), admin._id),
      'LAST_MANAGER_FORBIDDEN',
    )
    expect(repository.users.get(admin._id)?.role).toBe('MANAGER')
  })

  it('实际管理者向已通过审核的管理员传位直接完成事务，不需要所有者审批', async () => {
    const repository = new InMemoryMembershipRepository()
    const service = createService(repository)
    const owner = seedUser(repository, 'owner-openid', 'OWNER')
    const manager = seedUser(repository, 'manager-openid', 'MANAGER')
    const admin = seedUser(repository, 'admin-openid', 'ADMIN')

    await expect(
      service.transferManager(userIdOf('manager-openid'), { targetUserId: admin._id }),
    ).resolves.toMatchObject({
      id: admin._id,
      role: 'MANAGER',
      status: 'APPROVED',
      reviewedBy: manager._id,
      reviewedAt: '2026-07-29T13:00:00.000Z',
    })

    expect(repository.users.get(admin._id)?.role).toBe('MANAGER')
    expect(repository.users.get(manager._id)?.role).toBe('ADMIN')
    expect(repository.users.get(manager._id)?.status).toBe('APPROVED')
    expect(repository.users.get(owner._id)?.role).toBe('OWNER')
    expect(repository.requests.size).toBe(0)
    expect(
      [...repository.users.values()].filter(
        (user) => user.role === 'MANAGER' && user.status === 'APPROVED',
      ),
    ).toHaveLength(1)

    await expectApiCode(
      service.transferManager(userIdOf('manager-openid'), { targetUserId: admin._id }),
      'FORBIDDEN',
    )
  })

  it('传位必须双向校验转出方与接任者，实际管理者只能转出自己的身份', async () => {
    const repository = new InMemoryMembershipRepository()
    const service = createService(repository)
    const owner = seedUser(repository, 'owner-openid', 'OWNER')
    const manager = seedUser(repository, 'manager-openid', 'MANAGER')
    const otherManager = seedUser(repository, 'other-manager-openid', 'MANAGER')
    const admin = seedUser(repository, 'admin-openid', 'ADMIN')
    const pendingAdmin = seedUser(repository, 'pending-admin-openid', 'ADMIN', 'PENDING')
    const member = seedUser(repository, 'member-openid', 'MEMBER')

    await expectApiCode(
      service.transferManager(userIdOf('admin-openid'), { targetUserId: admin._id }),
      'FORBIDDEN',
    )
    await expectApiCode(
      service.transferManager(userIdOf('member-openid'), { targetUserId: admin._id }),
      'FORBIDDEN',
    )
    await expectApiCode(
      service.transferManager(userIdOf('owner-openid'), { targetUserId: admin._id }),
      'INVALID_USER_ID',
    )
    await expectApiCode(
      service.transferManager(userIdOf('owner-openid'), {
        targetUserId: admin._id,
        sourceManagerId: 'missing-user',
      }),
      'USER_NOT_FOUND',
    )
    await expectApiCode(
      service.transferManager(userIdOf('owner-openid'), {
        targetUserId: admin._id,
        sourceManagerId: admin._id,
      }),
      'MANAGER_TARGET_INVALID',
    )
    await expectApiCode(
      service.transferManager(userIdOf('owner-openid'), {
        targetUserId: member._id,
        sourceManagerId: manager._id,
      }),
      'MANAGER_TARGET_INVALID',
    )
    await expectApiCode(
      service.transferManager(userIdOf('owner-openid'), {
        targetUserId: pendingAdmin._id,
        sourceManagerId: manager._id,
      }),
      'MANAGER_TARGET_INVALID',
    )
    await expectApiCode(
      service.transferManager(userIdOf('owner-openid'), {
        targetUserId: otherManager._id,
        sourceManagerId: manager._id,
      }),
      'MANAGER_TARGET_INVALID',
    )
    await expectApiCode(
      service.transferManager(userIdOf('manager-openid'), { targetUserId: ' ' }),
      'INVALID_USER_ID',
    )
    await expectApiCode(
      service.transferManager(userIdOf('manager-openid'), { targetUserId: 'missing-user' }),
      'USER_NOT_FOUND',
    )

    await service.transferManager(userIdOf('manager-openid'), {
      targetUserId: admin._id,
      sourceManagerId: otherManager._id,
    })
    expect(repository.users.get(manager._id)?.role).toBe('ADMIN')
    expect(repository.users.get(otherManager._id)?.role).toBe('MANAGER')
    expect(repository.users.get(admin._id)?.role).toBe('MANAGER')

    await expect(
      service.transferManager(userIdOf('owner-openid'), {
        targetUserId: manager._id,
        sourceManagerId: otherManager._id,
      }),
    ).resolves.toMatchObject({
      id: manager._id,
      role: 'MANAGER',
      reviewedBy: owner._id,
    })
    expect(repository.users.get(otherManager._id)?.role).toBe('ADMIN')
  })
})
