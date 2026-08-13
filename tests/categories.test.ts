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
  itemCategoryIds = new Set<string>()
  users = new Map<string, UserRecord>()

  async runTransaction<T>(
    operation: (unitOfWork: CategoryUnitOfWork) => Promise<T>,
  ): Promise<T> {
    const categories = cloneMap(this.categories)
    const result = await operation(
      new InMemoryCategoryUnitOfWork(
        this.users,
        categories,
        this.itemCategoryIds,
      ),
    )
    this.categories = categories
    return result
  }
}

class InMemoryCategoryUnitOfWork implements CategoryUnitOfWork {
  constructor(
    private readonly users: Map<string, UserRecord>,
    private readonly categories: Map<string, CategoryRecord>,
    private readonly itemCategoryIds: Set<string>,
  ) {}

  getUser(userId: string): Promise<UserRecord | null> {
    return Promise.resolve(
      [...this.users.values()].find((user) => user._id === userId) ??
        null,
    )
  }

  getCategory(categoryId: string): Promise<CategoryRecord | null> {
    const category = this.categories.get(categoryId)
    return Promise.resolve(
      category && category.status !== 'DELETED' ? category : null,
    )
  }

  getCategoryByNormalizedName(
    normalizedName: string,
  ): Promise<CategoryRecord | null> {
    return Promise.resolve(
      [...this.categories.values()].find(
        (category) =>
          category.normalized_name === normalizedName &&
          category.status !== 'DELETED',
      ) ?? null,
    )
  }

  hasItemReference(categoryId: string): Promise<boolean> {
    return Promise.resolve(this.itemCategoryIds.has(categoryId))
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

  listAllCategories(): Promise<CategoryRecord[]> {
    return Promise.resolve(
      [...this.categories.values()].filter(
        (category) => category.status !== 'DELETED',
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
  role: UserRecord['role'] = 'MEMBER',
): UserRecord {
  return {
    _id: `user-${openid}`,
    openid,
    display_name: openid,
    role,
    status,
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
  }
}

function createService(repository: InMemoryCategoryRepository) {
  let categorySequence = 0
  return new CategoryService(
    repository,
    () => '2026-07-30T01:00:00.000Z',
    () => `custom-category-${++categorySequence}`,
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

    const first = await service.list('user-approved-openid')
    const second = await service.list('user-approved-openid')

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
      'user-approved-openid',
      '  活动器材  ',
    )
    expect(created).toMatchObject({
      name: '活动器材',
      isPreset: false,
      status: 'ACTIVE',
      createdBy: 'user-approved-openid',
    })

    await expectApiCode(
      service.create('user-approved-openid', '活动器材'),
      'CATEGORY_NAME_EXISTS',
    )
    const categories = await service.list('user-approved-openid')
    expect(categories[categories.length - 1]?.name).toBe('活动器材')
  })

  it('规范化后的预设分类名称不能被重复创建', async () => {
    const repository = new InMemoryCategoryRepository()
    repository.users.set('approved-user', createUser('approved-openid'))
    const service = createService(repository)

    await expectApiCode(
      service.create('user-approved-openid', ' 日常用品 '),
      'CATEGORY_NAME_EXISTS',
    )
    expect(repository.categories.size).toBe(0)
    await expect(service.list('user-approved-openid')).resolves.toHaveLength(
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
      service.list('user-pending-openid'),
      'ACCOUNT_NOT_ACTIVE',
    )
    await expectApiCode(
      service.create('user-disabled-openid', '测试分类'),
      'ACCOUNT_NOT_ACTIVE',
    )
    expect(repository.categories.size).toBe(0)
  })

  it('只有管理员和所有者可以查看、重命名和停用自定义分类', async () => {
    const repository = new InMemoryCategoryRepository()
    repository.users.set('member', createUser('member-openid'))
    repository.users.set(
      'admin',
      createUser('admin-openid', 'APPROVED', 'ADMIN'),
    )
    const service = createService(repository)
    const category = await service.create('user-member-openid', '活动器材')

    await expectApiCode(
      service.listManageable('user-member-openid'),
      'FORBIDDEN',
    )
    await expectApiCode(
      service.rename('user-member-openid', category.id, '体育器材'),
      'FORBIDDEN',
    )
    await expectApiCode(
      service.setStatus(
        'user-member-openid',
        category.id,
        'DISABLED',
      ),
      'FORBIDDEN',
    )

    const renamed = await service.rename(
      'user-admin-openid',
      category.id,
      '体育器材',
    )
    expect(renamed).toMatchObject({
      id: category.id,
      name: '体育器材',
    })

    const recreated = await service.create('user-member-openid', '活动器材')
    expect(recreated.id).not.toBe(category.id)

    await service.setStatus(
      'user-admin-openid',
      category.id,
      'DISABLED',
    )
    const active = await service.list('user-member-openid')
    expect(active.some((item) => item.id === category.id)).toBe(false)
    const manageable = await service.listManageable('user-admin-openid')
    expect(
      manageable.find((item) => item.id === category.id)?.status,
    ).toBe('DISABLED')

    await service.setStatus('user-admin-openid', category.id, 'ACTIVE')
    await expect(service.list('user-member-openid')).resolves.toContainEqual(
      expect.objectContaining({ id: category.id, status: 'ACTIVE' }),
    )
  })

  it('管理员可删除未引用分类，但成员、预设分类和已引用分类不可删除', async () => {
    const repository = new InMemoryCategoryRepository()
    repository.users.set('member', createUser('member-openid'))
    repository.users.set(
      'admin',
      createUser('admin-openid', 'APPROVED', 'ADMIN'),
    )
    const service = createService(repository)
    const unused = await service.create('user-member-openid', '未使用分类')

    await expectApiCode(
      service.delete('user-member-openid', unused.id),
      'FORBIDDEN',
    )
    await expect(
      service.delete('user-admin-openid', unused.id),
    ).resolves.toEqual({ id: unused.id })
    expect(repository.categories.get(unused.id)?.status).toBe('DELETED')

    const referenced = await service.create(
      'user-member-openid',
      '已使用分类',
    )
    repository.itemCategoryIds.add(referenced.id)
    await expectApiCode(
      service.delete('user-admin-openid', referenced.id),
      'CATEGORY_IN_USE',
    )
    expect(repository.categories.get(referenced.id)?.status).not.toBe(
      'DELETED',
    )

    repository.itemCategoryIds.delete(referenced.id)
    repository.categories.set(referenced.id, {
      ...repository.categories.get(referenced.id)!,
      item_reference_count: 1,
    })
    await expect(
      service.delete('user-admin-openid', referenced.id),
    ).resolves.toEqual({ id: referenced.id })

    await expect(
      service.listManageable('user-admin-openid'),
    ).resolves.not.toContainEqual(
      expect.objectContaining({ id: referenced.id }),
    )
    const rebuilt = await service.create('user-member-openid', '已使用分类')
    expect(rebuilt.id).not.toBe(referenced.id)

    const [preset] = await service.listManageable('user-admin-openid')
    await expectApiCode(
      service.delete('user-admin-openid', preset!.id),
      'PRESET_CATEGORY_IMMUTABLE',
    )
  })

  it('管理员不能重命名或停用预设分类', async () => {
    const repository = new InMemoryCategoryRepository()
    repository.users.set(
      'owner',
      createUser('owner-openid', 'APPROVED', 'OWNER'),
    )
    const service = createService(repository)
    const [preset] = await service.listManageable('user-owner-openid')
    expect(preset?.isPreset).toBe(true)

    await expectApiCode(
      service.rename('user-owner-openid', preset!.id, '新名称'),
      'PRESET_CATEGORY_IMMUTABLE',
    )
    await expectApiCode(
      service.setStatus(
        'user-owner-openid',
        preset!.id,
        'DISABLED',
      ),
      'PRESET_CATEGORY_IMMUTABLE',
    )
  })
})
