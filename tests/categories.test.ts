import { describe, expect, it } from 'vitest'

import type {
  CategoryRepository,
  CategoryUnitOfWork,
} from '../cloudfunctions/api/src/categories/repository'
import {
  CategoryService,
  presetCategoryNames,
} from '../cloudfunctions/api/src/categories/service'
import type { CategoryRecord } from '../cloudfunctions/api/src/categories/types'
import type { UserRecord } from '../cloudfunctions/api/src/membership/types'

class InMemoryCategoryRepository implements CategoryRepository {
  categories = new Map<string, CategoryRecord>()
  users = new Map<string, UserRecord>()

  async runTransaction<T>(
    operation: (unitOfWork: CategoryUnitOfWork) => Promise<T>,
  ): Promise<T> {
    const categories = cloneMap(this.categories)
    const result = await operation(
      new InMemoryCategoryUnitOfWork(this.users, categories),
    )
    this.categories = categories
    return result
  }
}

class InMemoryCategoryUnitOfWork implements CategoryUnitOfWork {
  constructor(
    private readonly users: Map<string, UserRecord>,
    private readonly categories: Map<string, CategoryRecord>,
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

  listActiveCategories(): Promise<CategoryRecord[]> {
    return Promise.resolve(
      [...this.categories.values()].filter(
        (category) => category.status === 'ACTIVE',
      ),
    )
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
  openid: string,
  status: UserRecord['status'] = 'APPROVED',
): UserRecord {
  return {
    _id: `user-${openid}`,
    openid,
    display_name: openid,
    role: 'MEMBER',
    status,
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
  }
}

function createService(repository: InMemoryCategoryRepository) {
  return new CategoryService(
    repository,
    () => '2026-07-30T01:00:00.000Z',
  )
}

async function expectApiCode(
  operation: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(operation).rejects.toMatchObject({ code })
}

describe('分类服务', () => {
  it('重复查询只初始化一套预设分类并保持规定顺序', async () => {
    const repository = new InMemoryCategoryRepository()
    repository.users.set('approved-user', createUser('approved-openid'))
    const service = createService(repository)

    const first = await service.list('approved-openid')
    const second = await service.list('approved-openid')

    expect(first.map((category) => category.name)).toEqual(
      presetCategoryNames,
    )
    expect(second).toEqual(first)
    expect(repository.categories.size).toBe(presetCategoryNames.length)
    expect(first.every((category) => category.isPreset)).toBe(true)
  })

  it('成员可以创建分类，名称会去除首尾空格且不能重复', async () => {
    const repository = new InMemoryCategoryRepository()
    repository.users.set('approved-user', createUser('approved-openid'))
    const service = createService(repository)

    const created = await service.create(
      'approved-openid',
      '  活动器材  ',
    )
    expect(created).toMatchObject({
      name: '活动器材',
      isPreset: false,
      status: 'ACTIVE',
      createdBy: 'user-approved-openid',
    })

    await expectApiCode(
      service.create('approved-openid', '活动器材'),
      'CATEGORY_NAME_EXISTS',
    )
    const categories = await service.list('approved-openid')
    expect(categories[categories.length - 1]?.name).toBe('活动器材')
  })

  it('规范化后的预设分类名称不能被重复创建', async () => {
    const repository = new InMemoryCategoryRepository()
    repository.users.set('approved-user', createUser('approved-openid'))
    const service = createService(repository)

    await expectApiCode(
      service.create('approved-openid', ' 日常用品 '),
      'CATEGORY_NAME_EXISTS',
    )
    expect(repository.categories.size).toBe(0)
    await expect(service.list('approved-openid')).resolves.toHaveLength(
      presetCategoryNames.length,
    )
  })

  it('未审核和停用账号不能查询或创建分类', async () => {
    const repository = new InMemoryCategoryRepository()
    repository.users.set(
      'pending-user',
      createUser('pending-openid', 'PENDING'),
    )
    repository.users.set(
      'disabled-user',
      createUser('disabled-openid', 'DISABLED'),
    )
    const service = createService(repository)

    await expectApiCode(
      service.list('pending-openid'),
      'ACCOUNT_NOT_ACTIVE',
    )
    await expectApiCode(
      service.create('disabled-openid', '测试分类'),
      'ACCOUNT_NOT_ACTIVE',
    )
    expect(repository.categories.size).toBe(0)
  })
})
