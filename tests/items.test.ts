import { describe, expect, it } from 'vitest'

import type { CategoryRecord } from '../cloudfunctions/api/src/categories/types'
import type {
  ItemRepository,
  ItemUnitOfWork,
} from '../cloudfunctions/api/src/items/repository'
import { ItemService } from '../cloudfunctions/api/src/items/service'
import type {
  CreateItemInput,
  ItemOperationLogRecord,
  ItemRecord,
} from '../cloudfunctions/api/src/items/types'
import type { UserRecord } from '../cloudfunctions/api/src/membership/types'

class InMemoryItemRepository implements ItemRepository {
  categories = new Map<string, CategoryRecord>()
  items = new Map<string, ItemRecord>()
  logs = new Map<string, ItemOperationLogRecord>()
  users = new Map<string, UserRecord>()
  failOnLogWrite = false

  async runTransaction<T>(
    operation: (unitOfWork: ItemUnitOfWork) => Promise<T>,
  ): Promise<T> {
    const categories = cloneMap(this.categories)
    const items = cloneMap(this.items)
    const logs = cloneMap(this.logs)
    const result = await operation(
      new InMemoryItemUnitOfWork(
        this.users,
        categories,
        items,
        logs,
        this.failOnLogWrite,
      ),
    )
    this.categories = categories
    this.items = items
    this.logs = logs
    return result
  }
}

class InMemoryItemUnitOfWork implements ItemUnitOfWork {
  constructor(
    private readonly users: Map<string, UserRecord>,
    private readonly categories: Map<string, CategoryRecord>,
    private readonly items: Map<string, ItemRecord>,
    private readonly logs: Map<string, ItemOperationLogRecord>,
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

  setCategory(category: CategoryRecord): Promise<void> {
    this.categories.set(category._id, structuredClone(category))
    return Promise.resolve()
  }

  setItem(item: ItemRecord): Promise<void> {
    this.items.set(item._id, structuredClone(item))
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

function createService(repository: InMemoryItemRepository): ItemService {
  return new ItemService(
    repository,
    () => '2026-07-30T02:00:00.000Z',
    () => 'item-1',
    () => 'item-log-1',
    () => 'A1B2C3D4E5F6',
  )
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
    expect(repository.items.size).toBe(0)
    expect(repository.logs.size).toBe(0)
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
      service.create('member-openid', createInput()),
    ).rejects.toThrow('模拟日志写入失败')
    expect(repository.items.size).toBe(0)
    expect(repository.logs.size).toBe(0)
    expect(
      repository.categories.get('category-daily')?.item_reference_count,
    ).toBeUndefined()
  })
})
