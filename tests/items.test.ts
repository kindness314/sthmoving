import { describe, expect, it } from 'vitest'

import type { CategoryRecord } from '../cloudfunctions/api/src/categories/types'
import type { ItemLabelRecord } from '../cloudfunctions/api/src/labels/types'
import type {
  ItemRepository,
  ItemUnitOfWork,
} from '../cloudfunctions/api/src/items/repository'
import { ItemService } from '../cloudfunctions/api/src/items/service'
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

  listItems(query: ItemListQuery): Promise<ItemRecord[]> {
    const keyword = query.keyword?.toLocaleLowerCase('zh-CN')
    return Promise.resolve(
      [...this.items.values()]
        .filter(
          (item) =>
            item.status === 'ACTIVE' ||
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

function createService(repository: InMemoryItemRepository): ItemService {
  return new ItemService(
    repository,
    () => '2026-07-30T02:00:00.000Z',
    () => 'item-1',
    () => 'item-log-1',
    () => 'A1B2C3D4E5F6',
    () => 'category-new',
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
        createInput({ commitSummary: '太短' }),
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
