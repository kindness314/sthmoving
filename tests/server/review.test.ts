import type { IncomingMessage } from 'node:http'

import { describe, expect, it, vi } from 'vitest'

import type {
  MembershipRepository,
  MembershipUnitOfWork,
} from '../../cloudfunctions/api/src/membership/repository'
import type { UserRecord } from '../../cloudfunctions/api/src/membership/types'
import type { ApiRouter } from '../../cloudfunctions/api/src/router'
import { createRealmDispatch } from '../../server/src/app'
import { createRealmAuthenticator } from '../../server/src/auth/routes'
import type {
  SessionIdentity,
  SessionStore,
} from '../../server/src/auth/sessions'
import type {
  ActiveTestAccess,
  TestAccessControl,
} from '../../server/src/review/access'
import { createReviewRouter } from '../../server/src/review/handlers'
import {
  formatTestPassword,
  generateTestPassword,
  normalizeTestPassword,
  verifyTestPassword,
} from '../../server/src/review/passwords'
import { sandboxOpenid, sandboxUserId } from '../../server/src/review/sandbox'
import { createTestSessionService } from '../../server/src/review/test-session'

const testPrefix = 't1_'

function requestWith(authorization?: string): IncomingMessage {
  return {
    headers: authorization ? { authorization } : {},
  } as unknown as IncomingMessage
}

function sessionStore(
  identity: SessionIdentity | null,
): SessionStore & { readonly issued: string[] } {
  const issued: string[] = []
  return {
    issued,
    issue: async (userId, options) => {
      issued.push(userId)
      return {
        token: `${testPrefix}sandbox-token`,
        expiresAt:
          options?.expiresAtCap?.toISOString() ?? '2026-09-01T00:00:00.000Z',
      }
    },
    verify: async () => identity,
    revokeUser: async () => {},
    revoke: async () => {},
  }
}

function accessControl(
  active: ActiveTestAccess | null,
): TestAccessControl & {
  readonly enabled: string[]
  readonly disabled: number
  readonly used: string[]
  readonly password: string
} {
  const state = {
    enabled: [] as string[],
    disabled: 0,
    used: [] as string[],
    password: '',
  }
  return {
    get enabled() {
      return state.enabled
    },
    get disabled() {
      return state.disabled
    },
    get used() {
      return state.used
    },
    get password() {
      return state.password
    },
    active: async () => active,
    enable: async (createdBy) => {
      state.enabled.push(createdBy)
      state.password = generateTestPassword().plaintext
      return {
        password: state.password,
        expiresAt: '2026-09-01T00:00:00.000Z',
      }
    },
    disable: async () => {
      state.disabled += 1
    },
    recordUse: async (id) => {
      state.used.push(id)
    },
  }
}

function membershipStub(
  users: readonly UserRecord[],
): MembershipRepository {
  const store = new Map(users.map((user) => [user._id, user]))
  const unitOfWork: MembershipUnitOfWork = {
    getUser: async (userId) => store.get(userId) ?? null,
    setUser: async (user) => {
      store.set(user._id, user)
    },
    countOwners: async () => 0,
    countManagers: async () => 0,
    findPendingJoinRequest: async () => null,
    getJoinRequest: async () => null,
    setJoinRequest: async () => {},
    listPendingJoinRequests: async () => [],
    listUsers: async () => [...store.values()],
    searchApprovedMembers: async () => ({ users: [], hasMore: false }),
  }
  return {
    runTransaction: async (operation) => operation(unitOfWork),
  }
}

function user(overrides: Partial<UserRecord> & { _id: string }): UserRecord {
  return {
    openid: `openid-${overrides._id}`,
    display_name: '成员',
    role: 'MEMBER',
    status: 'APPROVED',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('测试口令', () => {
  it('生成的口令可校验并按四位分组展示', () => {
    const generated = generateTestPassword()
    expect(generated.plaintext).toHaveLength(16)
    expect(formatTestPassword(generated.plaintext)).toMatch(
      /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/,
    )
    expect(
      verifyTestPassword(generated.plaintext, generated.salt, generated.hash),
    ).toBe(true)
  })

  it('容错大小写与分隔符，错误口令不通过', () => {
    const generated = generateTestPassword()
    const typed = formatTestPassword(generated.plaintext).toLowerCase()
    expect(normalizeTestPassword(typed)).toBe(generated.plaintext)
    expect(
      verifyTestPassword(typed, generated.salt, generated.hash),
    ).toBe(true)
    expect(
      verifyTestPassword('WRONG-PASSWORD', generated.salt, generated.hash),
    ).toBe(false)
  })
})

describe('数据域鉴权', () => {
  it('生产令牌只在生产库校验且不标记数据域', async () => {
    const authenticate = createRealmAuthenticator({
      prod: sessionStore({ userId: 'prod-user', openid: 'prod-openid' }),
      test: sessionStore(null),
      testPrefix,
    })
    await expect(authenticate(requestWith('Bearer plain-token'))).resolves.toEqual(
      { userId: 'prod-user', openid: 'prod-openid' },
    )
  })

  it('带前缀的令牌命中沙箱库并标记 test 域', async () => {
    const authenticate = createRealmAuthenticator({
      prod: sessionStore(null),
      test: sessionStore({ userId: sandboxUserId, openid: sandboxOpenid }),
      testPrefix,
    })
    await expect(
      authenticate(requestWith(`Bearer ${testPrefix}abc`)),
    ).resolves.toEqual({
      userId: sandboxUserId,
      openid: sandboxOpenid,
      realm: 'test',
    })
  })

  it('前缀与随机串碰撞时回落到生产库', async () => {
    const authenticate = createRealmAuthenticator({
      prod: sessionStore({ userId: 'prod-user', openid: 'prod-openid' }),
      test: sessionStore(null),
      testPrefix,
    })
    await expect(
      authenticate(requestWith(`Bearer ${testPrefix}collision`)),
    ).resolves.toEqual({ userId: 'prod-user', openid: 'prod-openid' })
  })

  it('缺少或无效令牌一律拒绝', async () => {
    const authenticate = createRealmAuthenticator({
      prod: sessionStore(null),
      testPrefix,
    })
    await expect(authenticate(requestWith())).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    })
    await expect(
      authenticate(requestWith('Bearer unknown')),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })
})

describe('测试口令登录', () => {
  const generated = generateTestPassword()
  const active: ActiveTestAccess = {
    id: 'access-1',
    createdAt: '2026-08-01T00:00:00.000Z',
    createdBy: 'owner-1',
    expiresAt: '2026-09-01T00:00:00.000Z',
    useCount: 0,
    lastUsedAt: null,
    passwordHash: generated.hash,
    passwordSalt: generated.salt,
  }

  it('入口未开启时拒绝', async () => {
    const service = createTestSessionService({
      access: accessControl(null),
      membership: membershipStub([]),
      sessions: sessionStore(null),
    })
    await expect(service.start('ANY')).rejects.toMatchObject({
      code: 'TEST_ACCESS_CLOSED',
    })
  })

  it('口令错误时拒绝且不签发会话', async () => {
    const sessions = sessionStore(null)
    const service = createTestSessionService({
      access: accessControl(active),
      membership: membershipStub([]),
      sessions,
    })
    await expect(service.start('WRONG')).rejects.toMatchObject({
      code: 'INVALID_TEST_PASSWORD',
    })
    expect(sessions.issued).toHaveLength(0)
  })

  it('口令正确时在沙箱库预置所有者并签发沙箱会话', async () => {
    const sessions = sessionStore(null)
    const access = accessControl(active)
    const membership = membershipStub([])
    const service = createTestSessionService({
      access,
      membership,
      sessions,
      now: () => new Date('2026-08-10T00:00:00.000Z'),
    })

    await expect(service.start(generated.plaintext)).resolves.toEqual({
      token: `${testPrefix}sandbox-token`,
      expiresAt: '2026-09-01T00:00:00.000Z',
    })

    const sandbox = await membership.runTransaction((unitOfWork) =>
      unitOfWork.getUser(sandboxUserId),
    )
    expect(sandbox).toMatchObject({
      _id: sandboxUserId,
      openid: sandboxOpenid,
      role: 'OWNER',
      status: 'APPROVED',
    })
    expect(sessions.issued).toEqual([sandboxUserId])
    expect(access.used).toEqual(['access-1'])
  })
})

describe('沙箱会话寿命', () => {
  it('签发的会话有效期被截断到口令到期时间', async () => {
    const generated = generateTestPassword()
    const soonExpiring: ActiveTestAccess = {
      id: 'access-1',
      createdAt: '2026-08-01T00:00:00.000Z',
      createdBy: null,
      expiresAt: '2026-08-20T00:00:00.000Z',
      useCount: 0,
      lastUsedAt: null,
      passwordHash: generated.hash,
      passwordSalt: generated.salt,
    }
    const service = createTestSessionService({
      access: accessControl(soonExpiring),
      membership: membershipStub([]),
      sessions: sessionStore(null),
    })

    const issued = await service.start(generated.plaintext)

    expect(issued.expiresAt).toBe('2026-08-20T00:00:00.000Z')
  })
})

describe('数据域分发', () => {
  const routerTagging = (tag: string): ApiRouter => async () => ({
    ok: true,
    data: tag,
  })

  it('生产域与沙箱域分别命中各自路由，review 固定走控制面', async () => {
    const dispatch = createRealmDispatch(
      routerTagging('prod'),
      routerTagging('test'),
      routerTagging('review'),
    )
    const context = { userId: 'u', openid: 'o' }

    await expect(
      dispatch({ module: 'items', action: 'list' }, context),
    ).resolves.toEqual({ ok: true, data: 'prod' })
    await expect(
      dispatch({ module: 'items', action: 'list' }, { ...context, realm: 'test' }),
    ).resolves.toEqual({ ok: true, data: 'test' })
    await expect(
      dispatch(
        { module: 'review', action: 'testAccess' },
        { ...context, realm: 'test' },
      ),
    ).resolves.toEqual({ ok: true, data: 'review' })
  })

  it('未配置沙箱时测试域请求回落生产路由', async () => {
    const dispatch = createRealmDispatch(
      routerTagging('prod'),
      null,
      routerTagging('review'),
    )
    await expect(
      dispatch(
        { module: 'items', action: 'list' },
        { userId: 'u', openid: 'o', realm: 'test' },
      ),
    ).resolves.toEqual({ ok: true, data: 'prod' })
  })
})

describe('测试入口控制面', () => {
  const routerWith = (options: {
    readonly actor: UserRecord
    readonly realm?: 'prod' | 'test'
  }) =>
    createReviewRouter({
      access: accessControl(null),
      membership: membershipStub([options.actor]),
      testSessions: sessionStore(null),
      ttlMilliseconds: 60 * 60 * 1000,
    })

  it('普通成员无权访问', async () => {
    const route = routerWith({ actor: user({ _id: 'member-1' }) })
    await expect(
      route(
        { module: 'review', action: 'testAccess' },
        { userId: 'member-1', openid: 'openid-member-1' },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })

  it('沙箱域内不提供该入口', async () => {
    const route = routerWith({
      actor: user({ _id: 'owner-1', role: 'OWNER' }),
    })
    await expect(
      route(
        { module: 'review', action: 'testAccess' },
        { userId: 'owner-1', openid: 'openid-owner-1', realm: 'test' },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'TEST_ACCESS_UNAVAILABLE' },
    })
  })

  it('实际管理者可以查询与开启入口', async () => {
    const access = accessControl(null)
    const route = createReviewRouter({
      access,
      membership: membershipStub([user({ _id: 'manager-1', role: 'MANAGER' })]),
      testSessions: sessionStore(null),
      ttlMilliseconds: 60 * 60 * 1000,
    })
    const context = { userId: 'manager-1', openid: 'openid-manager-1' }

    await expect(
      route({ module: 'review', action: 'testAccess' }, context),
    ).resolves.toMatchObject({
      ok: true,
      data: { enabled: false, expiresAt: null, useCount: 0 },
    })

    const enabled = await route(
      { module: 'review', action: 'enableTestAccess' },
      context,
    )
    expect(enabled).toMatchObject({
      ok: true,
      data: {
        enabled: true,
        expiresAt: '2026-09-01T00:00:00.000Z',
        password: formatTestPassword(access.password),
      },
    })
    expect(access.enabled).toEqual(['manager-1'])
  })

  it('控制面返回口令生成者的昵称', async () => {
    const generated = generateTestPassword()
    const access = accessControl({
      id: 'access-1',
      createdBy: 'owner-1',
      createdAt: '2026-08-01T00:00:00.000Z',
      expiresAt: '2026-09-01T00:00:00.000Z',
      useCount: 0,
      lastUsedAt: null,
      passwordHash: generated.hash,
      passwordSalt: generated.salt,
    })
    const route = createReviewRouter({
      access,
      membership: membershipStub([
        user({ _id: 'manager-1', role: 'MANAGER' }),
        user({ _id: 'owner-1', display_name: '主人老王' }),
      ]),
      testSessions: sessionStore(null),
      ttlMilliseconds: 60 * 60 * 1000,
    })

    await expect(
      route(
        { module: 'review', action: 'testAccess' },
        { userId: 'manager-1', openid: 'openid-manager-1' },
      ),
    ).resolves.toMatchObject({
      ok: true,
      data: { enabled: true, createdByName: '主人老王' },
    })
  })

  it('关闭入口会一并吊销沙箱会话', async () => {
    const testSessions = sessionStore(null)
    const revokeUser = vi.spyOn(testSessions, 'revokeUser')
    const route = createReviewRouter({
      access: accessControl(null),
      membership: membershipStub([user({ _id: 'owner-1', role: 'OWNER' })]),
      testSessions,
      ttlMilliseconds: 60 * 60 * 1000,
    })

    await expect(
      route(
        { module: 'review', action: 'disableTestAccess' },
        { userId: 'owner-1', openid: 'openid-owner-1' },
      ),
    ).resolves.toEqual({ ok: true, data: { enabled: false } })
    expect(revokeUser).toHaveBeenCalledWith(sandboxUserId)
  })

  it('轮换口令时一并吊销已签发的沙箱会话', async () => {
    const testSessions = sessionStore(null)
    const revokeUser = vi.spyOn(testSessions, 'revokeUser')
    const route = createReviewRouter({
      access: accessControl(null),
      membership: membershipStub([user({ _id: 'owner-1', role: 'OWNER' })]),
      testSessions,
      ttlMilliseconds: 60 * 60 * 1000,
    })

    await expect(
      route(
        { module: 'review', action: 'enableTestAccess' },
        { userId: 'owner-1', openid: 'openid-owner-1' },
      ),
    ).resolves.toMatchObject({ ok: true, data: { enabled: true } })
    expect(revokeUser).toHaveBeenCalledWith(sandboxUserId)
  })
})
