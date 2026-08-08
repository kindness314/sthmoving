import { describe, expect, it } from 'vitest'

import type { CategoryRecord } from '../cloudfunctions/api/src/categories/types'
import type { ItemLabelRecord } from '../cloudfunctions/api/src/labels/types'
import type {
  ItemRepository,
  ItemUnitOfWork,
} from '../cloudfunctions/api/src/items/repository'
import {
  ItemService,
  type ItemFileUrlResolver,
} from '../cloudfunctions/api/src/items/service'
import type {
  CreateItemInput,
  ItemListQuery,
  ItemOperationLogRecord,
  ItemRecord,
} from '../cloudfunctions/api/src/items/types'
import type { UserRecord } from '../cloudfunctions/api/src/membership/types'

class InMemoryItemRepository implements ItemRepository {
  categories = new Map<string, CategoryRecord>()
  items = new Map<string, ItemRecord>()
  logs = new Map<string, ItemOperationLogRecord>()
  labels = new Map<string, ItemLabelRecord>()
  users = new Map<string, UserRecord>()
  failOnLogWrite = false

  getUserByOpenid(openid: string): Promise<UserRecord | null> {
    return Promise.resolve(
      [...this.users.values()].find((user) => user.openid === openid) ??
        null,
    )
  }

  getCategory(categoryId: string): Promise<CategoryRecord | null> {
    return Promise.resolve(this.categories.get(categoryId) ?? null)
  }

  getCategoriesByIds(categoryIds: string[]): Promise<CategoryRecord[]> {
    return Promise.resolve(
      categoryIds
        .map((id) => this.categories.get(id))
        .filter((value): value is CategoryRecord => Boolean(value)),
    )
  }

  getUsersByIds(userIds: string[]): Promise<UserRecord[]> {
    return Promise.resolve(
      userIds
        .map((id) => this.users.get(id))
        .filter((value): value is UserRecord => Boolean(value)),
    )
  }

  getItem(itemId: string): Promise<ItemRecord | null> {
    return Promise.resolve(this.items.get(itemId) ?? null)
  }

  listOperationLogs(itemId: string): Promise<ItemOperationLogRecord[]> {
    return Promise.resolve(
      [...this.logs.values()]
        .filter((log) => log.item_id === itemId)
        .sort((left, right) =>
          right.created_at.localeCompare(left.created_at),
        ),
    )
  }

  listItems(query: ItemListQuery): Promise<ItemRecord[]> {
    const keyword = query.keyword?.toLocaleLowerCase('zh-CN')
    return Promise.resolve(
      [...this.items.values()]
        .filter(
          (item) =>
            query.status
              ? item.status === query.status
              : item.status === 'ACTIVE' ||
                item.status === 'OUTBOUND_PENDING',
        )
        .filter(
          (item) =>
            !query.categoryId ||
            item.category_id === query.categoryId,
        )
        .filter((item) => {
          if (!keyword) {
            return true
          }
          return [item.name, item.description, item.code].some((value) =>
            value.toLocaleLowerCase('zh-CN').includes(keyword),
          )
        })
        .filter((item) => {
          if (!query.cursor) {
            return true
          }
          return (
            item.updated_at < query.cursor.updatedAt ||
            (item.updated_at === query.cursor.updatedAt &&
              item._id < query.cursor.id)
          )
        })
        .sort(
          (left, right) =>
            right.updated_at.localeCompare(left.updated_at) ||
            right._id.localeCompare(left._id),
        )
        .slice(0, query.limit),
    )
  }

  async runTransaction<T>(
    operation: (unitOfWork: ItemUnitOfWork) => Promise<T>,
  ): Promise<T> {
    const categories = cloneMap(this.categories)
    const items = cloneMap(this.items)
    const logs = cloneMap(this.logs)
    const labels = cloneMap(this.labels)
    const result = await operation(
      new InMemoryItemUnitOfWork(
        this.users,
        categories,
        items,
        logs,
        labels,
        this.failOnLogWrite,
      ),
    )
    this.categories = categories
    this.items = items
    this.logs = logs
    this.labels = labels
    return result
  }
}

class InMemoryItemUnitOfWork implements ItemUnitOfWork {
  constructor(
    private readonly users: Map<string, UserRecord>,
    private readonly categories: Map<string, CategoryRecord>,
    private readonly items: Map<string, ItemRecord>,
    private readonly logs: Map<string, ItemOperationLogRecord>,
    private readonly labels: Map<string, ItemLabelRecord>,
    private readonly failOnLogWrite: boolean,
  ) {}

  getUserByOpenid(openid: string): Promise<UserRecord | null> {
    return Promise.resolve(
      [...this.users.values()].find((user) => user.openid === openid) ??
        null,
    )
  }

  getCategory(categoryId: string): Promise<CategoryRecord | null> {
    return Promise.resolve(this.categories.get(categoryId) ?? null)
  }

  getCategoryByNormalizedName(
    normalizedName: string,
  ): Promise<CategoryRecord | null> {
    return Promise.resolve(
      [...this.categories.values()].find(
        (category) => category.normalized_name === normalizedName,
      ) ?? null,
    )
  }

  getItem(itemId: string): Promise<ItemRecord | null> {
    return Promise.resolve(this.items.get(itemId) ?? null)
  }

  setCategory(category: CategoryRecord): Promise<void> {
    this.categories.set(category._id, structuredClone(category))
    return Promise.resolve()
  }

  setItem(item: ItemRecord): Promise<void> {
    this.items.set(item._id, structuredClone(item))
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

function createUser(
  status: UserRecord['status'] = 'APPROVED',
): UserRecord {
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

function createCategory(
  status: CategoryRecord['status'] = 'ACTIVE',
): CategoryRecord {
  return {
    _id: 'category-daily',
    name: '日常用品',
    normalized_name: '日常用品',
    status,
    is_preset: true,
    sort_order: 0,
    created_by: 'SYSTEM',
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
  }
}

function createInput(
  overrides: Partial<CreateItemInput> = {},
): CreateItemInput {
  return {
    name: '折叠桌',
    images: [],
    description: '活动使用',
    quantityMode: 'SINGLE',
    quantity: 1,
    categoryId: 'category-daily',
    commitSummary: '首次登记物品',
    ...overrides,
  }
}

function createNewCategoryInput(name = '活动器材'): CreateItemInput {
  const input = createInput()
  delete input.categoryId
  return {
    ...input,
    newCategoryName: name,
  }
}

function createService(
  repository: InMemoryItemRepository,
  resolveFileUrls: ItemFileUrlResolver = async (fileIds) =>
    new Map(fileIds.map((fileId) => [fileId, fileId])),
): ItemService {
  return new ItemService(
    repository,
    () => '2026-07-30T02:00:00.000Z',
    () => 'item-1',
    () => 'item-log-1',
    () => 'A1B2C3D4E5F6',
    () => 'category-new',
    resolveFileUrls,
  )
}

function createItemRecord(
  id: string,
  overrides: Partial<ItemRecord> = {},
): ItemRecord {
  return {
    _id: id,
    code: `CODE-${id}`,
    name: `物品${id}`,
    images: [],
    description: '活动使用',
    quantity_mode: 'SINGLE',
    quantity: 1,
    category_id: 'category-daily',
    status: 'ACTIVE',
    version: 1,
    registered_by: 'user-member',
    registered_at: '2026-07-30T01:00:00.000Z',
    updated_by: 'user-member',
    updated_at: '2026-07-30T01:00:00.000Z',
    ...overrides,
  }
}

function prepareRepository(): InMemoryItemRepository {
  const repository = new InMemoryItemRepository()
  repository.users.set('user-member', createUser())
  repository.categories.set('category-daily', createCategory())
  return repository
}

async function expectApiCode(
  operation: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(operation).rejects.toMatchObject({ code })
}

describe('物品登记服务', () => {
  it('登记单件物品并在同一事务写入首条操作日志', async () => {
    const repository = prepareRepository()
    const service = createService(repository)

    const item = await service.create(
      'member-openid',
      createInput({
        name: '  折叠桌  ',
        description: '  活动使用  ',
        images: [' cloud://env/items/table.jpg '],
      }),
    )

    expect(item).toEqual({
      id: 'item-1',
      code: 'A1B2C3D4E5F6',
      name: '折叠桌',
      images: ['cloud://env/items/table.jpg'],
      description: '活动使用',
      quantityMode: 'SINGLE',
      quantity: 1,
      categoryId: 'category-daily',
      status: 'ACTIVE',
      version: 1,
      registeredBy: 'user-member',
      registeredAt: '2026-07-30T02:00:00.000Z',
      updatedBy: 'user-member',
      updatedAt: '2026-07-30T02:00:00.000Z',
    })
    expect(repository.items.get('item-1')).toMatchObject({
      code: 'A1B2C3D4E5F6',
      registered_by: 'user-member',
      updated_by: 'user-member',
      version: 1,
    })
    expect(
      repository.categories.get('category-daily')?.item_reference_count,
    ).toBe(1)
    expect(repository.logs.get('item-log-1')).toEqual({
      _id: 'item-log-1',
      item_id: 'item-1',
      operator_id: 'user-member',
      action_type: 'CREATE',
      commit_summary: '首次登记物品',
      version_before: 0,
      version_after: 1,
      created_at: '2026-07-30T02:00:00.000Z',
    })
    expect(repository.labels.get('item-label-item-1')).toEqual({
      _id: 'item-label-item-1',
      item_id: 'item-1',
      public_code: 'A1B2C3D4E5F6',
      page: 'pages/item-detail/index',
      scene: 'i=A1B2C3D4E5F6',
      status: 'PENDING',
      attempt_count: 0,
      created_at: '2026-07-30T02:00:00.000Z',
      updated_at: '2026-07-30T02:00:00.000Z',
    })
  })

  it('允许登记数量为正整数的多件物品和两张图片', async () => {
    const repository = prepareRepository()
    const service = createService(repository)

    await expect(
      service.create(
        'member-openid',
        createInput({
          images: ['cloud://env/1.jpg', 'cloud://env/2.jpg'],
          quantityMode: 'MULTIPLE',
          quantity: 12,
        }),
      ),
    ).resolves.toMatchObject({
      images: ['cloud://env/1.jpg', 'cloud://env/2.jpg'],
      quantityMode: 'MULTIPLE',
      quantity: 12,
    })
  })

  it('提交物品时在同一事务创建并引用新分类', async () => {
    const repository = prepareRepository()
    const service = createService(repository)

    await expect(
      service.create(
        'member-openid',
        createNewCategoryInput('  活动器材  '),
      ),
    ).resolves.toMatchObject({ categoryId: 'category-new' })
    expect(repository.categories.get('category-new')).toMatchObject({
      name: '活动器材',
      normalized_name: '活动器材',
      is_preset: false,
      item_reference_count: 1,
      created_by: 'user-member',
    })
    expect(repository.items.get('item-1')?.category_id).toBe(
      'category-new',
    )

    await expectApiCode(
      service.create(
        'member-openid',
        createNewCategoryInput(' 日常用品 '),
      ),
      'CATEGORY_NAME_EXISTS',
    )
  })

  it('拒绝无效字段、数量、图片和提交梗概', async () => {
    const repository = prepareRepository()
    const service = createService(repository)

    await expectApiCode(
      service.create(
        'member-openid',
        createInput({ quantity: 2 }),
      ),
      'INVALID_ITEM_QUANTITY',
    )
    await expectApiCode(
      service.create(
        'member-openid',
        createInput({ quantityMode: 'MULTIPLE', quantity: 1.5 }),
      ),
      'INVALID_ITEM_QUANTITY',
    )
    await expectApiCode(
      service.create(
        'member-openid',
        createInput({ images: ['1', '2', '3'] }),
      ),
      'INVALID_ITEM_IMAGES',
    )
    await expectApiCode(
      service.create(
        'member-openid',
        createInput({ images: ['not-a-cloud-file-id'] }),
      ),
      'INVALID_ITEM_IMAGES',
    )
    await expectApiCode(
      service.create('member-openid', createInput({ name: '   ' })),
      'INVALID_ITEM_NAME',
    )
    await expectApiCode(
      service.create(
        'member-openid',
        createInput({ description: '详情'.repeat(1001) }),
      ),
      'INVALID_ITEM_DESCRIPTION',
    )
    await expectApiCode(
      service.create(
        'member-openid',
        createInput({ commitSummary: '   ' }),
      ),
      'INVALID_COMMIT_SUMMARY',
    )
    await expectApiCode(
      service.create(
        'member-openid',
        createInput({ commitSummary: '字'.repeat(251) }),
      ),
      'INVALID_COMMIT_SUMMARY',
    )
    await expectApiCode(
      service.create(
        'member-openid',
        createInput({ newCategoryName: '活动器材' }),
      ),
      'INVALID_CATEGORY_SELECTION',
    )
    const noCategory = createInput()
    delete noCategory.categoryId
    await expectApiCode(
      service.create('member-openid', noCategory),
      'INVALID_CATEGORY_SELECTION',
    )
    expect(repository.items.size).toBe(0)
    expect(repository.logs.size).toBe(0)
    expect(repository.labels.size).toBe(0)
    expect(
      repository.categories.get('category-daily')?.item_reference_count,
    ).toBeUndefined()
  })

  it('拒绝未审核账号、无效分类和停用分类', async () => {
    const repository = prepareRepository()
    const service = createService(repository)

    repository.users.set('user-member', createUser('PENDING'))
    await expectApiCode(
      service.create('member-openid', createInput()),
      'ACCOUNT_NOT_ACTIVE',
    )

    repository.users.set('user-member', createUser())
    await expectApiCode(
      service.create(
        'member-openid',
        createInput({ categoryId: 'missing-category' }),
      ),
      'CATEGORY_NOT_FOUND',
    )

    repository.categories.set(
      'category-daily',
      createCategory('DISABLED'),
    )
    await expectApiCode(
      service.create('member-openid', createInput()),
      'CATEGORY_DISABLED',
    )
  })

  it('日志写入失败时回滚物品记录', async () => {
    const repository = prepareRepository()
    repository.failOnLogWrite = true
    const service = createService(repository)

    await expect(
      service.create('member-openid', createNewCategoryInput()),
    ).rejects.toThrow('模拟日志写入失败')
    expect(repository.items.size).toBe(0)
    expect(repository.logs.size).toBe(0)
    expect(repository.labels.size).toBe(0)
    expect(
      repository.categories.has('category-new'),
    ).toBe(false)
  })

  it('updates fields with optimistic version and writes UPDATE log', async () => {
    const repository = prepareRepository()
    repository.items.set('item-1', createItemRecord('item-1'))
    const service = createService(repository)

    await expect(
      service.update('member-openid', {
        itemId: 'item-1',
        expectedVersion: 1,
        name: 'Updated item',
        images: ['cloud://env/items/new.jpg'],
        description: 'Updated details',
        quantityMode: 'MULTIPLE',
        quantity: 3,
        commitSummary: 'Update item details',
      }),
    ).resolves.toMatchObject({
      id: 'item-1',
      name: 'Updated item',
      images: ['cloud://env/items/new.jpg'],
      description: 'Updated details',
      quantityMode: 'MULTIPLE',
      quantity: 3,
      version: 2,
      updatedBy: 'user-member',
      updatedAt: '2026-07-30T02:00:00.000Z',
    })
    expect(repository.items.get('item-1')).toMatchObject({
      version: 2,
      updated_by: 'user-member',
      updated_at: '2026-07-30T02:00:00.000Z',
    })
    expect(repository.logs.get('item-log-1')).toMatchObject({
      item_id: 'item-1',
      operator_id: 'user-member',
      action_type: 'UPDATE',
      commit_summary: 'Update item details',
      version_before: 1,
      version_after: 2,
    })
  })

  it('only allows administrators to adjust an item category', async () => {
    const repository = prepareRepository()
    repository.items.set('item-1', createItemRecord('item-1'))
    repository.categories.set('category-tech', {
      ...createCategory(),
      _id: 'category-tech',
      name: '技术设备',
      normalized_name: '技术设备',
      is_preset: false,
    })
    const service = createService(repository)

    await expectApiCode(
      service.update('member-openid', {
        itemId: 'item-1',
        expectedVersion: 1,
        categoryId: 'category-tech',
        commitSummary: '调整物品分类',
      }),
      'FORBIDDEN',
    )

    repository.users.set('user-admin', {
      ...createUser(),
      _id: 'user-admin',
      openid: 'admin-openid',
      role: 'ADMIN',
    })
    await expect(
      service.update('admin-openid', {
        itemId: 'item-1',
        expectedVersion: 1,
        categoryId: 'category-tech',
        commitSummary: '调整物品分类',
      }),
    ).resolves.toMatchObject({
      categoryId: 'category-tech',
      version: 2,
      updatedBy: 'user-admin',
    })
    expect(repository.items.get('item-1')?.category_id).toBe('category-tech')
    expect(repository.categories.get('category-tech')?.item_reference_count).toBe(1)
  })

  it('returns latest item on version conflict without mutation', async () => {
    const repository = prepareRepository()
    repository.items.set(
      'item-1',
      createItemRecord('item-1', { version: 2, name: 'Latest item' }),
    )
    const service = createService(repository)

    await expect(
      service.update('member-openid', {
        itemId: 'item-1',
        expectedVersion: 1,
        name: 'Local change',
        commitSummary: 'Change item name',
      }),
    ).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
      details: {
        latestVersion: 2,
        latestItem: { id: 'item-1', name: 'Latest item' },
      },
    })
    expect(repository.items.get('item-1')).toMatchObject({
      version: 2,
      name: 'Latest item',
    })
    expect(repository.logs.size).toBe(0)
  })

  it('rejects no changes, invalid quantity, and off-shelf updates', async () => {
    const repository = prepareRepository()
    repository.items.set('item-1', createItemRecord('item-1'))
    const service = createService(repository)

    await expectApiCode(
      service.update('member-openid', {
        itemId: 'item-1',
        expectedVersion: 1,
        commitSummary: 'No field changes',
      }),
      'NO_ITEM_CHANGES',
    )
    await expectApiCode(
      service.update('member-openid', {
        itemId: 'item-1',
        expectedVersion: 1,
        name: '物品item-1',
        images: [],
        description: '活动使用',
        quantityMode: 'SINGLE',
        quantity: 1,
        commitSummary: 'Same field values',
      }),
      'NO_ITEM_CHANGES',
    )
    await expectApiCode(
      service.update('member-openid', {
        itemId: 'item-1',
        expectedVersion: 1,
        quantityMode: 'SINGLE',
        quantity: 2,
        commitSummary: 'Change quantity mode',
      }),
      'INVALID_ITEM_QUANTITY',
    )

    repository.items.set(
      'item-1',
      createItemRecord('item-1', { status: 'OFF_SHELF' }),
    )
    await expectApiCode(
      service.update('member-openid', {
        itemId: 'item-1',
        expectedVersion: 1,
        name: 'Archived item',
        commitSummary: 'Try editing archived item',
      }),
      'ITEM_NOT_EDITABLE',
    )
  })

  it('rolls back update when UPDATE log write fails', async () => {
    const repository = prepareRepository()
    repository.items.set('item-1', createItemRecord('item-1'))
    repository.failOnLogWrite = true
    const service = createService(repository)

    await expect(
      service.update('member-openid', {
        itemId: 'item-1',
        expectedVersion: 1,
        name: 'Updated item',
        commitSummary: 'Update item name',
      }),
    ).rejects.toThrow('模拟日志写入失败')
    expect(repository.items.get('item-1')).toMatchObject({
      version: 1,
      name: '物品item-1',
    })
    expect(repository.logs.size).toBe(0)
  })

  it('resolves cloud storage file IDs to temporary URLs for list and detail', async () => {
    const repository = prepareRepository()
    repository.items.set(
      'item-table',
      createItemRecord('item-table', {
        images: ['cloud://env/items/table.jpg'],
      }),
    )
    const requested: string[][] = []
    const service = createService(repository, async (fileIds) => {
      requested.push(fileIds)
      return new Map(
        fileIds.map((fileId) => [
          fileId,
          `https://storage.example/${encodeURIComponent(fileId)}`,
        ]),
      )
    })
    const expectedUrl =
      'https://storage.example/cloud%3A%2F%2Fenv%2Fitems%2Ftable.jpg'

    await expect(
      service.list('member-openid', {}),
    ).resolves.toMatchObject({
      items: [{ id: 'item-table', images: [expectedUrl] }],
    })
    await expect(
      service.detail('member-openid', 'item-table'),
    ).resolves.toMatchObject({ images: [expectedUrl] })
    expect(requested).toEqual([
      ['cloud://env/items/table.jpg'],
      ['cloud://env/items/table.jpg'],
    ])
  })

  it('returns read-only operation logs with operator display names', async () => {
    const repository = prepareRepository()
    repository.items.set('item-1', createItemRecord('item-1'))
    repository.logs.set('item-log-1', {
      _id: 'item-log-1',
      item_id: 'item-1',
      operator_id: 'user-member',
      action_type: 'CREATE',
      commit_summary: 'Create item record',
      version_before: 0,
      version_after: 1,
      created_at: '2026-07-30T01:00:00.000Z',
    })
    const service = createService(repository)

    await expect(
      service.logs('member-openid', 'item-1'),
    ).resolves.toEqual([
      {
        id: 'item-log-1',
        itemId: 'item-1',
        action: 'CREATE',
        summary: 'Create item record',
        operator: { id: 'user-member', displayName: '成员' },
        operatedAt: '2026-07-30T01:00:00.000Z',
        itemVersion: 1,
      },
    ])
  })
})

describe('物品查询服务', () => {
  it('按更新时间和 ID 稳定分页，并排除已离库物品', async () => {
    const repository = prepareRepository()
    repository.items.set(
      'item-c',
      createItemRecord('item-c', {
        updated_at: '2026-07-30T03:00:00.000Z',
      }),
    )
    repository.items.set(
      'item-b',
      createItemRecord('item-b', {
        updated_at: '2026-07-30T03:00:00.000Z',
      }),
    )
    repository.items.set(
      'item-a',
      createItemRecord('item-a', {
        updated_at: '2026-07-30T02:00:00.000Z',
        status: 'OUTBOUND_PENDING',
      }),
    )
    repository.items.set(
      'item-off',
      createItemRecord('item-off', { status: 'OFF_SHELF' }),
    )
    const service = createService(repository)

    const first = await service.list('member-openid', { limit: 2 })
    expect(first.items.map((item) => item.id)).toEqual([
      'item-c',
      'item-b',
    ])
    expect(first.nextCursor).toEqual({
      updatedAt: '2026-07-30T03:00:00.000Z',
      id: 'item-b',
    })

    expect(first.nextCursor).toBeDefined()
    const second = await service.list('member-openid', {
      limit: 2,
      cursor: first.nextCursor!,
    })
    expect(second.items.map((item) => item.id)).toEqual(['item-a'])
    expect(second.nextCursor).toBeUndefined()
  })

  it('按名称、详情、编码和启用分类查询物品', async () => {
    const repository = prepareRepository()
    repository.items.set(
      'item-table',
      createItemRecord('item-table', {
        code: 'ABC123',
        name: '折叠桌',
        description: '招新活动使用',
      }),
    )
    repository.items.set(
      'item-cable',
      createItemRecord('item-cable', {
        code: 'XYZ789',
        name: '网线',
        description: '机房备用',
      }),
    )
    const service = createService(repository)

    await expect(
      service.list('member-openid', {
        keyword: '活动',
        categoryId: 'category-daily',
      }),
    ).resolves.toMatchObject({
      items: [{ id: 'item-table', category: { name: '日常用品' } }],
    })
    await expect(
      service.list('member-openid', { keyword: 'xyz789' }),
    ).resolves.toMatchObject({ items: [{ id: 'item-cable' }] })

    repository.categories.set(
      'category-daily',
      createCategory('DISABLED'),
    )
    await expectApiCode(
      service.list('member-openid', {
        categoryId: 'category-daily',
      }),
      'CATEGORY_DISABLED',
    )
  })

  it('只有管理员可以在管理查询中查看已离库物品', async () => {
    const repository = prepareRepository()
    repository.items.set(
      'item-off-shelf',
      createItemRecord('item-off-shelf', { status: 'OFF_SHELF' }),
    )
    const service = createService(repository)

    await expectApiCode(
      service.list('member-openid', { status: 'OFF_SHELF' }),
      'FORBIDDEN',
    )
    repository.users.set('user-admin', {
      ...createUser(),
      _id: 'user-admin',
      openid: 'admin-openid',
      display_name: '管理员',
      role: 'ADMIN',
    })
    await expect(
      service.list('admin-openid', { status: 'OFF_SHELF' }),
    ).resolves.toMatchObject({
      items: [{ id: 'item-off-shelf', status: 'OFF_SHELF', version: 1 }],
    })
  })

  it('详情包含分类、登记人、最后修改人和版本', async () => {
    const repository = prepareRepository()
    repository.items.set(
      'item-table',
      createItemRecord('item-table', {
        images: ['cloud://env/items/table.jpg'],
        version: 3,
      }),
    )
    const service = createService(repository)

    await expect(
      service.detail('member-openid', 'item-table'),
    ).resolves.toMatchObject({
      id: 'item-table',
      images: ['cloud://env/items/table.jpg'],
      imageFileIds: ['cloud://env/items/table.jpg'],
      category: { id: 'category-daily', name: '日常用品' },
      registeredBy: { id: 'user-member', displayName: '成员' },
      updatedBy: { id: 'user-member', displayName: '成员' },
      version: 3,
    })
    await expectApiCode(
      service.detail('member-openid', 'missing'),
      'ITEM_NOT_FOUND',
    )
  })

  it('拒绝未审核账号和无效查询参数', async () => {
    const repository = prepareRepository()
    const service = createService(repository)

    repository.users.set('user-member', createUser('PENDING'))
    await expectApiCode(
      service.list('member-openid', {}),
      'ACCOUNT_NOT_ACTIVE',
    )
    repository.users.set('user-member', createUser())
    await expectApiCode(
      service.list('member-openid', { limit: 21 }),
      'INVALID_PAGE_SIZE',
    )
    await expectApiCode(
      service.list('member-openid', {
        cursor: { id: '', updatedAt: 'not-a-date' },
      }),
      'INVALID_CURSOR',
    )
  })
})
