import { describe, expect, it } from 'vitest'

import type {
  ItemOperationLogRecord,
  ItemRecord,
} from '../cloudfunctions/api/src/items/types'
import type { ItemLabelRecord } from '../cloudfunctions/api/src/labels/types'
import type { UserRecord } from '../cloudfunctions/api/src/membership/types'
import type {
  OutboundRepository,
  OutboundUnitOfWork,
} from '../cloudfunctions/api/src/outbound/repository'
import { OutboundService } from '../cloudfunctions/api/src/outbound/service'
import type { OutboundImageStorage } from '../cloudfunctions/api/src/outbound/storage'
import type {
  OutboundRequestRecord,
} from '../cloudfunctions/api/src/outbound/types'
import type { NotificationRecord } from '../cloudfunctions/api/src/notifications/types'

class InMemoryOutboundRepository implements OutboundRepository {
  users = new Map<string, UserRecord>()
  items = new Map<string, ItemRecord>()
  requests = new Map<string, OutboundRequestRecord>()
  labels = new Map<string, ItemLabelRecord>()
  logs = new Map<string, ItemOperationLogRecord>()
  notifications = new Map<string, NotificationRecord>()
  failOnLogWrite = false

  async runTransaction<T>(
    operation: (unitOfWork: OutboundUnitOfWork) => Promise<T>,
  ): Promise<T> {
    const items = cloneMap(this.items)
    const requests = cloneMap(this.requests)
    const labels = cloneMap(this.labels)
    const logs = cloneMap(this.logs)
    const notifications = cloneMap(this.notifications)
    const result = await operation(
      new InMemoryOutboundUnitOfWork(
        this.users,
        items,
        requests,
        labels,
        logs,
        notifications,
        this.failOnLogWrite,
      ),
    )
    this.items = items
    this.requests = requests
    this.labels = labels
    this.logs = logs
    this.notifications = notifications
    return result
  }
}

class FakeOutboundImageStorage implements OutboundImageStorage {
  deleted: string[] = []
  fail = false

  async delete(fileIds: readonly string[]): Promise<void> {
    if (this.fail) {
      throw new Error('模拟图片清理失败')
    }
    this.deleted.push(...fileIds)
  }
}

class InMemoryOutboundUnitOfWork implements OutboundUnitOfWork {
  constructor(
    private readonly users: Map<string, UserRecord>,
    private readonly items: Map<string, ItemRecord>,
    private readonly requests: Map<string, OutboundRequestRecord>,
    private readonly labels: Map<string, ItemLabelRecord>,
    private readonly logs: Map<string, ItemOperationLogRecord>,
    private readonly notifications: Map<string, NotificationRecord>,
    private readonly failOnLogWrite: boolean,
  ) {}

  getUserByOpenid(openid: string): Promise<UserRecord | null> {
    return Promise.resolve(
      [...this.users.values()].find((user) => user.openid === openid) ??
        null,
    )
  }

  getItem(itemId: string): Promise<ItemRecord | null> {
    return Promise.resolve(this.items.get(itemId) ?? null)
  }

  getUser(userId: string): Promise<UserRecord | null> {
    return Promise.resolve(this.users.get(userId) ?? null)
  }

  getRequest(requestId: string): Promise<OutboundRequestRecord | null> {
    return Promise.resolve(this.requests.get(requestId) ?? null)
  }

  findPendingRequest(
    itemId: string,
  ): Promise<OutboundRequestRecord | null> {
    return Promise.resolve(
      [...this.requests.values()].find(
        (request) =>
          request.item_id === itemId && request.status === 'PENDING',
      ) ?? null,
    )
  }

  listPendingRequests(limit: number): Promise<OutboundRequestRecord[]> {
    return Promise.resolve(
      [...this.requests.values()]
        .filter((request) => request.status === 'PENDING')
        .sort((left, right) =>
          right.created_at.localeCompare(left.created_at),
        )
        .slice(0, limit),
    )
  }

  listRequestsByApplicant(
    applicantId: string,
    limit: number,
  ): Promise<OutboundRequestRecord[]> {
    return Promise.resolve(
      [...this.requests.values()]
        .filter((request) => request.applicant_id === applicantId)
        .sort((left, right) =>
          right.created_at.localeCompare(left.created_at),
        )
      .slice(0, limit),
    )
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

  getLabelByItemId(itemId: string): Promise<ItemLabelRecord | null> {
    return Promise.resolve(
      [...this.labels.values()].find((label) => label.item_id === itemId) ??
        null,
    )
  }

  setItem(item: ItemRecord): Promise<void> {
    this.items.set(item._id, structuredClone(item))
    return Promise.resolve()
  }

  deleteItem(itemId: string): Promise<void> {
    this.items.delete(itemId)
    return Promise.resolve()
  }

  setRequest(request: OutboundRequestRecord): Promise<void> {
    this.requests.set(request._id, structuredClone(request))
    return Promise.resolve()
  }

  setLabel(label: ItemLabelRecord): Promise<void> {
    this.labels.set(label._id, structuredClone(label))
    return Promise.resolve()
  }

  setOperationLog(log: ItemOperationLogRecord): Promise<void> {
    if (this.failOnLogWrite) {
      throw new Error('模拟日志写入失败')
    }
    this.logs.set(log._id, structuredClone(log))
    return Promise.resolve()
  }
}

function cloneMap<TValue>(source: Map<string, TValue>): Map<string, TValue> {
  return new Map(
    [...source.entries()].map(([key, value]) => [
      key,
      structuredClone(value),
    ]),
  )
}

function createUser(status: UserRecord['status'] = 'APPROVED'): UserRecord {
  return {
    _id: 'user-member',
    openid: 'member-openid',
    display_name: '成员',
    role: 'MEMBER',
    status,
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
  }
}

function createItem(
  status: ItemRecord['status'] = 'ACTIVE',
): ItemRecord {
  return {
    _id: 'item-1',
    code: 'ABC123',
    name: '折叠桌',
    images: [],
    description: '活动使用',
    quantity_mode: 'SINGLE',
    quantity: 1,
    category_id: 'category-daily',
    status,
    version: 3,
    registered_by: 'user-member',
    registered_at: '2026-07-30T01:00:00.000Z',
    updated_by: 'user-member',
    updated_at: '2026-07-30T01:00:00.000Z',
  }
}

function createSecondItem(
  status: ItemRecord['status'] = 'ACTIVE',
): ItemRecord {
  return {
    ...createItem(status),
    _id: 'item-2',
    code: 'DEF456',
    name: '活动椅',
    images: ['cloud://env/items/chair.jpg'],
    version: 2,
  }
}

function createService(
  repository: InMemoryOutboundRepository,
  imageStorage?: OutboundImageStorage,
): OutboundService {
  let logIndex = 4
  return new OutboundService(
    repository,
    () => '2026-07-30T04:00:00.000Z',
    () => 'outbound-1',
    () => `item-log-${logIndex++}`,
    imageStorage,
  )
}

function prepareRepository(): InMemoryOutboundRepository {
  const repository = new InMemoryOutboundRepository()
  repository.users.set('user-member', createUser())
  repository.items.set('item-1', createItem())
  repository.labels.set('label-1', createLabel())
  return repository
}

function createLabel(
  status: ItemLabelRecord['status'] = 'READY',
): ItemLabelRecord {
  return {
    _id: 'label-1',
    item_id: 'item-1',
    public_code: 'ABC123',
    page: 'pages/item-detail/index',
    scene: 'i=ABC123',
    status,
    attempt_count: 1,
    created_at: '2026-07-30T01:00:00.000Z',
    updated_at: '2026-07-30T01:00:00.000Z',
  }
}

function createSecondLabel(
  status: ItemLabelRecord['status'] = 'READY',
): ItemLabelRecord {
  return {
    ...createLabel(status),
    _id: 'label-2',
    item_id: 'item-2',
    public_code: 'DEF456',
    scene: 'i=DEF456',
  }
}

function addAdmin(repository: InMemoryOutboundRepository): void {
  repository.users.set('user-admin', {
    ...createUser(),
    _id: 'user-admin',
    openid: 'admin-openid',
    display_name: '管理员',
    role: 'ADMIN',
  })
}

async function expectApiCode(
  operation: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(operation).rejects.toMatchObject({ code })
}

describe('离库申请服务', () => {
  it('在同一事务创建申请、更新物品状态并写入日志', async () => {
    const repository = prepareRepository()
    addAdmin(repository)
    const service = createService(repository)

    await expect(
      service.createRequest('member-openid', {
        itemId: 'item-1',
        reason: '物品已经损坏',
      }),
    ).resolves.toEqual({
      id: 'outbound-1',
      itemId: 'item-1',
      applicantId: 'user-member',
      reason: '物品已经损坏',
      status: 'PENDING',
      createdAt: '2026-07-30T04:00:00.000Z',
      updatedAt: '2026-07-30T04:00:00.000Z',
    })
    expect(repository.items.get('item-1')).toMatchObject({
      status: 'OUTBOUND_PENDING',
      version: 4,
      updated_by: 'user-member',
      updated_at: '2026-07-30T04:00:00.000Z',
    })
    expect(repository.requests.get('outbound-1')).toMatchObject({
      item_id: 'item-1',
      applicant_id: 'user-member',
      reason: '物品已经损坏',
      status: 'PENDING',
    })
    expect(repository.logs.get('item-log-4')).toMatchObject({
      item_id: 'item-1',
      operator_id: 'user-member',
      action_type: 'OUTBOUND_REQUEST',
      commit_summary: '物品已经损坏',
      version_before: 3,
      version_after: 4,
    })
    expect(repository.notifications.size).toBe(0)
  })

  it('拒绝重复申请、已离库物品和无效原因', async () => {
    const repository = prepareRepository()
    const service = createService(repository)
    repository.requests.set('outbound-old', {
      _id: 'outbound-old',
      item_id: 'item-1',
      applicant_id: 'user-member',
      reason: '旧的离库原因',
      status: 'PENDING',
      created_at: '2026-07-30T03:00:00.000Z',
      updated_at: '2026-07-30T03:00:00.000Z',
    })

    await expectApiCode(
      service.createRequest('member-openid', {
        itemId: 'item-1',
        reason: '再次申请离库',
      }),
      'OUTBOUND_REQUEST_PENDING',
    )
    repository.requests.clear()
    repository.items.set(
      'item-1',
      createItem('OFF_SHELF'),
    )
    await expectApiCode(
      service.createRequest('member-openid', {
        itemId: 'item-1',
        reason: '申请已经离库的物品',
      }),
      'ITEM_NOT_REQUESTABLE',
    )
    await expectApiCode(
      service.createRequest('member-openid', {
        itemId: 'item-1',
        reason: '   ',
      }),
      'INVALID_OUTBOUND_REASON',
    )
    await expectApiCode(
      service.createRequest('member-openid', {
        itemId: 'item-1',
        reason: '字'.repeat(251),
      }),
      'INVALID_OUTBOUND_REASON',
    )
  })

  it('日志写入失败时回滚申请和物品状态', async () => {
    const repository = prepareRepository()
    repository.failOnLogWrite = true
    const service = createService(repository)

    await expect(
      service.createRequest('member-openid', {
        itemId: 'item-1',
        reason: '物品已经损坏',
      }),
    ).rejects.toThrow('模拟日志写入失败')
    expect(repository.items.get('item-1')).toMatchObject({
      status: 'ACTIVE',
      version: 3,
    })
    expect(repository.requests.size).toBe(0)
    expect(repository.logs.size).toBe(0)
  })

  it('拒绝未审核账号提交申请', async () => {
    const repository = prepareRepository()
    repository.users.set('user-member', createUser('PENDING'))
    const service = createService(repository)

    await expectApiCode(
      service.createRequest('member-openid', {
        itemId: 'item-1',
        reason: '物品已经损坏',
      }),
      'ACCOUNT_NOT_ACTIVE',
    )
  })

  it('管理员同意离库并作废标签', async () => {
    const repository = prepareRepository()
    addAdmin(repository)
    repository.items.set('item-1', {
      ...createItem('OUTBOUND_PENDING'),
      version: 4,
    })
    repository.requests.set('outbound-1', {
      _id: 'outbound-1',
      item_id: 'item-1',
      applicant_id: 'user-member',
      reason: '物品已经损坏',
      status: 'PENDING',
      created_at: '2026-07-30T03:00:00.000Z',
      updated_at: '2026-07-30T03:00:00.000Z',
    })
    const service = createService(repository)

    await expect(
      service.approveRequest('admin-openid', {
        requestId: 'outbound-1',
      }),
    ).resolves.toMatchObject({ id: 'outbound-1', status: 'APPROVED' })
    expect(repository.items.get('item-1')).toMatchObject({
      status: 'OFF_SHELF',
      version: 5,
      off_shelf_by: 'user-admin',
    })
    expect(repository.labels.get('label-1')).toMatchObject({ status: 'VOID' })
    expect(repository.logs.get('item-log-4')).toMatchObject({
      action_type: 'OUTBOUND_APPROVE',
      operator_id: 'user-admin',
      commit_summary: '同意离库申请',
      version_before: 4,
      version_after: 5,
    })
    expect(repository.requests.get('outbound-1')).not.toHaveProperty(
      'review_summary',
    )
  })

  it('管理员列表只返回待处理申请及关联摘要', async () => {
    const repository = prepareRepository()
    addAdmin(repository)
    repository.items.set('item-1', {
      ...createItem('OUTBOUND_PENDING'),
      version: 4,
    })
    repository.requests.set('outbound-1', {
      _id: 'outbound-1',
      item_id: 'item-1',
      applicant_id: 'user-member',
      reason: '物品已经损坏',
      status: 'PENDING',
      created_at: '2026-07-30T03:00:00.000Z',
      updated_at: '2026-07-30T03:00:00.000Z',
    })
    repository.requests.set('outbound-old', {
      _id: 'outbound-old',
      item_id: 'item-1',
      applicant_id: 'user-member',
      reason: '历史申请',
      status: 'REJECTED',
      created_at: '2026-07-30T02:00:00.000Z',
      updated_at: '2026-07-30T02:00:00.000Z',
    })
    const service = createService(repository)

    await expect(
      service.listPendingRequests('admin-openid'),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'outbound-1',
        applicant: { id: 'user-member', displayName: '成员' },
        item: {
          id: 'item-1',
          code: 'ABC123',
          name: '折叠桌',
          status: 'OUTBOUND_PENDING',
          version: 4,
        },
      }),
    ])
  })

  it('成员可以查看自己的离库申请状态', async () => {
    const repository = prepareRepository()
    repository.requests.set('outbound-1', {
      _id: 'outbound-1',
      item_id: 'item-1',
      applicant_id: 'user-member',
      reason: '物品已经损坏',
      status: 'REJECTED',
      reviewer_id: 'user-admin',
      review_summary: '物品仍需保留',
      reviewed_at: '2026-07-30T04:00:00.000Z',
      created_at: '2026-07-30T03:00:00.000Z',
      updated_at: '2026-07-30T04:00:00.000Z',
    })
    const service = createService(repository)

    await expect(
      service.listMyRequests('member-openid'),
    ).resolves.toEqual([
      {
        id: 'outbound-1',
        itemId: 'item-1',
        applicantId: 'user-member',
        reason: '物品已经损坏',
        status: 'REJECTED',
        createdAt: '2026-07-30T03:00:00.000Z',
        updatedAt: '2026-07-30T04:00:00.000Z',
        reviewerId: 'user-admin',
        reviewComment: '物品仍需保留',
        reviewedAt: '2026-07-30T04:00:00.000Z',
        item: {
          id: 'item-1',
          code: 'ABC123',
          name: '折叠桌',
          status: 'ACTIVE',
          version: 3,
        },
      },
    ])
  })

  it('管理员拒绝离库并恢复可申请状态', async () => {
    const repository = prepareRepository()
    addAdmin(repository)
    repository.items.set('item-1', {
      ...createItem('OUTBOUND_PENDING'),
      version: 4,
    })
    repository.requests.set('outbound-1', {
      _id: 'outbound-1',
      item_id: 'item-1',
      applicant_id: 'user-member',
      reason: '物品已经损坏',
      status: 'PENDING',
      created_at: '2026-07-30T03:00:00.000Z',
      updated_at: '2026-07-30T03:00:00.000Z',
    })
    const service = createService(repository)

    await expect(
      service.rejectRequest('admin-openid', {
        requestId: 'outbound-1',
        reviewSummary: '拒绝：物品仍需保留',
      }),
    ).resolves.toMatchObject({ id: 'outbound-1', status: 'REJECTED' })
    expect(repository.items.get('item-1')).toMatchObject({
      status: 'ACTIVE',
      version: 5,
      updated_by: 'user-admin',
    })
    expect(repository.items.get('item-1')).not.toHaveProperty('off_shelf_at')
    expect(repository.labels.get('label-1')).toMatchObject({ status: 'READY' })
    expect(repository.logs.get('item-log-4')).toMatchObject({
      action_type: 'OUTBOUND_REJECT',
      operator_id: 'user-admin',
    })
  })

  it('管理员可按版本直接离库', async () => {
    const repository = prepareRepository()
    addAdmin(repository)
    const service = createService(repository)

    await expect(
      service.directOutbound('admin-openid', {
        itemId: 'item-1',
        expectedVersion: 3,
        commitSummary: '管理员直接处理离库',
      }),
    ).resolves.toEqual({
      itemId: 'item-1',
      status: 'OFF_SHELF',
      version: 4,
      offShelfAt: '2026-07-30T04:00:00.000Z',
    })
    expect(repository.items.get('item-1')).toMatchObject({
      status: 'OFF_SHELF',
      version: 4,
    })
    expect(repository.labels.get('label-1')).toMatchObject({ status: 'VOID' })
  })

  it('管理员可按版本将已离库物品恢复入库并恢复标签', async () => {
    const repository = prepareRepository()
    addAdmin(repository)
    repository.items.set('item-1', createItem('OFF_SHELF'))
    repository.labels.set('label-1', {
      ...createLabel('VOID'),
      status_before_void: 'READY',
    })
    const service = createService(repository)

    await expect(
      service.restoreInbound('admin-openid', {
        itemId: 'item-1',
        expectedVersion: 3,
        commitSummary: '确认物品误操作离库，恢复入库',
      }),
    ).resolves.toEqual({
      itemId: 'item-1',
      status: 'ACTIVE',
      version: 4,
      restoredAt: '2026-07-30T04:00:00.000Z',
    })
    expect(repository.items.get('item-1')).toMatchObject({
      status: 'ACTIVE',
      version: 4,
      updated_by: 'user-admin',
    })
    expect(repository.items.get('item-1')).not.toHaveProperty('off_shelf_by')
    expect(repository.items.get('item-1')).not.toHaveProperty('off_shelf_at')
    expect(repository.labels.get('label-1')).toMatchObject({ status: 'READY' })
    expect(repository.labels.get('label-1')).not.toHaveProperty(
      'status_before_void',
    )
    expect(repository.logs.get('item-log-4')).toMatchObject({
      action_type: 'INBOUND',
      commit_summary: '确认物品误操作离库，恢复入库',
      version_before: 3,
      version_after: 4,
    })
  })

  it('重新入库只允许管理员处理已离库且版本一致的物品', async () => {
    const repository = prepareRepository()
    const service = createService(repository)

    await expectApiCode(
      service.restoreInbound('member-openid', {
        itemId: 'item-1',
        expectedVersion: 3,
        commitSummary: '成员尝试恢复入库',
      }),
      'FORBIDDEN',
    )
    addAdmin(repository)
    await expectApiCode(
      service.restoreInbound('admin-openid', {
        itemId: 'item-1',
        expectedVersion: 3,
        commitSummary: '恢复入库测试',
      }),
      'ITEM_NOT_RESTORABLE',
    )
    repository.items.set('item-1', createItem('OFF_SHELF'))
    repository.labels.set('label-1', createLabel('VOID'))
    await expectApiCode(
      service.restoreInbound('admin-openid', {
        itemId: 'item-1',
        expectedVersion: 2,
        commitSummary: '恢复入库测试',
      }),
      'VERSION_CONFLICT',
    )
  })

  it('管理员可在同一事务中批量重新入库并恢复多个标签', async () => {
    const repository = prepareRepository()
    addAdmin(repository)
    repository.items.set('item-1', createItem('OFF_SHELF'))
    repository.items.set('item-2', createSecondItem('OFF_SHELF'))
    repository.labels.set('label-1', {
      ...createLabel('VOID'),
      status_before_void: 'READY',
    })
    repository.labels.set('label-2', {
      ...createSecondLabel('VOID'),
      status_before_void: 'FAILED',
    })
    const service = createService(repository)

    await expect(
      service.batchRestoreInbound('admin-openid', {
        items: [
          { itemId: 'item-1', expectedVersion: 3 },
          { itemId: 'item-2', expectedVersion: 2 },
        ],
        commitSummary: '批量确认物品重新入库',
      }),
    ).resolves.toEqual({
      itemIds: ['item-1', 'item-2'],
      versionAfter: { 'item-1': 4, 'item-2': 3 },
      restoredAt: '2026-07-30T04:00:00.000Z',
    })
    expect(repository.items.get('item-1')).toMatchObject({
      status: 'ACTIVE',
      version: 4,
    })
    expect(repository.items.get('item-2')).toMatchObject({
      status: 'ACTIVE',
      version: 3,
    })
    expect(repository.labels.get('label-1')).toMatchObject({ status: 'READY' })
    expect(repository.labels.get('label-2')).toMatchObject({ status: 'FAILED' })
    expect(repository.logs.get('item-log-4')).toMatchObject({
      item_id: 'item-1',
      action_type: 'INBOUND',
    })
    expect(repository.logs.get('item-log-5')).toMatchObject({
      item_id: 'item-2',
      action_type: 'INBOUND',
    })
  })

  it('批量重新入库发现版本冲突时不修改任何物品', async () => {
    const repository = prepareRepository()
    addAdmin(repository)
    repository.items.set('item-1', createItem('OFF_SHELF'))
    repository.items.set('item-2', createSecondItem('OFF_SHELF'))
    repository.labels.set('label-1', {
      ...createLabel('VOID'),
      status_before_void: 'READY',
    })
    repository.labels.set('label-2', {
      ...createSecondLabel('VOID'),
      status_before_void: 'READY',
    })
    const service = createService(repository)

    await expectApiCode(
      service.batchRestoreInbound('admin-openid', {
        items: [
          { itemId: 'item-1', expectedVersion: 3 },
          { itemId: 'item-2', expectedVersion: 1 },
        ],
        commitSummary: '批量确认物品重新入库',
      }),
      'VERSION_CONFLICT',
    )
    expect(repository.items.get('item-1')).toMatchObject({
      status: 'OFF_SHELF',
      version: 3,
    })
    expect(repository.items.get('item-2')).toMatchObject({
      status: 'OFF_SHELF',
      version: 2,
    })
    expect(repository.logs.size).toBe(0)
  })

  it('管理员可在同一事务中批量离库并作废多个标签', async () => {
    const repository = prepareRepository()
    addAdmin(repository)
    repository.items.set('item-1', {
      ...createItem(),
      images: ['cloud://env/items/table.jpg'],
    })
    repository.items.set('item-2', createSecondItem())
    repository.labels.set('label-2', createSecondLabel())
    const service = createService(repository)

    await expect(
      service.batchDirectOutbound('admin-openid', {
        items: [
          { itemId: 'item-1', expectedVersion: 3 },
          { itemId: 'item-2', expectedVersion: 2 },
        ],
        commitSummary: '统一确认物品已报废',
      }),
    ).resolves.toEqual({
      itemIds: ['item-1', 'item-2'],
      versionAfter: { 'item-1': 4, 'item-2': 3 },
      offShelfAt: '2026-07-30T04:00:00.000Z',
    })
    expect(repository.items.get('item-1')).toMatchObject({
      status: 'OFF_SHELF',
      version: 4,
    })
    expect(repository.items.get('item-2')).toMatchObject({
      status: 'OFF_SHELF',
      version: 3,
    })
    expect(repository.labels.get('label-1')).toMatchObject({ status: 'VOID' })
    expect(repository.labels.get('label-2')).toMatchObject({ status: 'VOID' })
    expect(repository.logs.get('item-log-4')).toMatchObject({
      item_id: 'item-1',
      action_type: 'OUTBOUND',
    })
    expect(repository.logs.get('item-log-5')).toMatchObject({
      item_id: 'item-2',
      action_type: 'OUTBOUND',
    })
  })

  it('批量离库发现版本冲突时不修改任何物品', async () => {
    const repository = prepareRepository()
    addAdmin(repository)
    repository.items.set('item-2', createSecondItem())
    repository.labels.set('label-2', createSecondLabel())
    const service = createService(repository)

    await expectApiCode(
      service.batchDirectOutbound('admin-openid', {
        items: [
          { itemId: 'item-1', expectedVersion: 3 },
          { itemId: 'item-2', expectedVersion: 1 },
        ],
        commitSummary: '统一确认物品已报废',
      }),
      'VERSION_CONFLICT',
    )
    expect(repository.items.get('item-1')).toMatchObject({
      status: 'ACTIVE',
      version: 3,
    })
    expect(repository.items.get('item-2')).toMatchObject({
      status: 'ACTIVE',
      version: 2,
    })
    expect(repository.logs.size).toBe(0)
  })

  it('管理员可删除已离库物品并保留日志、申请和 VOID 标签', async () => {
    const repository = prepareRepository()
    addAdmin(repository)
    repository.items.set('item-1', {
      ...createItem('OFF_SHELF'),
      images: ['cloud://env/items/table.jpg'],
    })
    repository.requests.set('outbound-1', {
      _id: 'outbound-1',
      item_id: 'item-1',
      applicant_id: 'user-member',
      reason: '物品已经损坏',
      status: 'APPROVED',
      created_at: '2026-07-30T03:00:00.000Z',
      updated_at: '2026-07-30T04:00:00.000Z',
    })
    repository.logs.set('item-log-existing', {
      _id: 'item-log-existing',
      item_id: 'item-1',
      operator_id: 'user-member',
      action_type: 'OUTBOUND_APPROVE',
      commit_summary: '同意离库申请',
      version_before: 3,
      version_after: 4,
      created_at: '2026-07-30T04:00:00.000Z',
    })
    const storage = new FakeOutboundImageStorage()
    const service = createService(repository, storage)

    await expect(
      service.deleteItems('admin-openid', { itemIds: ['item-1'] }),
    ).resolves.toEqual({
      itemIds: ['item-1'],
      deletedImageCount: 1,
    })
    expect(repository.items.has('item-1')).toBe(false)
    expect(repository.labels.get('label-1')).toMatchObject({ status: 'VOID' })
    expect(repository.requests.has('outbound-1')).toBe(true)
    expect(repository.logs.has('item-log-existing')).toBe(true)
    expect(storage.deleted).toEqual(['cloud://env/items/table.jpg'])
  })

  it('批量删除只允许已离库物品且拒绝普通成员', async () => {
    const repository = prepareRepository()
    const service = createService(repository)

    await expectApiCode(
      service.deleteItems('member-openid', { itemIds: ['item-1'] }),
      'FORBIDDEN',
    )
    addAdmin(repository)
    await expectApiCode(
      service.deleteItems('admin-openid', { itemIds: ['item-1'] }),
      'ITEM_NOT_DELETABLE',
    )
    expect(repository.items.has('item-1')).toBe(true)
  })

  it('普通成员不能处理离库申请', async () => {
    const repository = prepareRepository()
    const service = createService(repository)

    await expectApiCode(
      service.listPendingRequests('member-openid'),
      'FORBIDDEN',
    )
  })
})
