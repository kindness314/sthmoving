import { describe, expect, it } from 'vitest'

import type { CategoryRepository } from '../../cloudfunctions/api/src/categories/repository'
import type { CategoryRecord } from '../../cloudfunctions/api/src/categories/types'
import {
  createCategory,
  createItem,
  type RepositoryHarness,
} from './support'

function createBareCategory(id: string): CategoryRecord {
  return {
    _id: id,
    name: id,
    normalized_name: id,
    status: 'ACTIVE',
    is_preset: true,
    sort_order: 3,
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
  }
}

function getCategory(
  repository: CategoryRepository,
  categoryId: string,
): Promise<CategoryRecord | null> {
  return repository.runTransaction((unitOfWork) =>
    unitOfWork.getCategory(categoryId),
  )
}

function getCategoryByNormalizedName(
  repository: CategoryRepository,
  normalizedName: string,
): Promise<CategoryRecord | null> {
  return repository.runTransaction((unitOfWork) =>
    unitOfWork.getCategoryByNormalizedName(normalizedName),
  )
}

function hasItemReference(
  repository: CategoryRepository,
  categoryId: string,
): Promise<boolean> {
  return repository.runTransaction((unitOfWork) =>
    unitOfWork.hasItemReference(categoryId),
  )
}

function listActiveCategories(
  repository: CategoryRepository,
): Promise<CategoryRecord[]> {
  return repository.runTransaction((unitOfWork) =>
    unitOfWork.listActiveCategories(),
  )
}

function listAllCategories(
  repository: CategoryRepository,
): Promise<CategoryRecord[]> {
  return repository.runTransaction((unitOfWork) =>
    unitOfWork.listAllCategories(),
  )
}

function setCategory(
  repository: CategoryRepository,
  category: CategoryRecord,
): Promise<void> {
  return repository.runTransaction((unitOfWork) =>
    unitOfWork.setCategory(category),
  )
}

function sortedIds(categories: CategoryRecord[]): string[] {
  return categories.map((category) => category._id).sort()
}

export function describeCategoryRepositoryContract(
  harness: RepositoryHarness<CategoryRepository>,
): void {
  describe(`CategoryRepository 契约（${harness.name}）`, () => {
    it('按 ID 读取分类返回完整记录', async () => {
      const repository = await harness.create({
        categories: [
          createCategory('category-1', {
            name: '折叠桌',
            normalized_name: '折叠桌',
            sort_order: 7,
            created_by: 'user-1',
          }),
        ],
      })

      await expect(getCategory(repository, 'category-1')).resolves.toMatchObject(
        {
          _id: 'category-1',
          name: '折叠桌',
          normalized_name: '折叠桌',
          status: 'ACTIVE',
          is_preset: false,
          sort_order: 7,
          created_by: 'user-1',
        },
      )
    })

    it('读取不存在的分类返回 null', async () => {
      const repository = await harness.create({
        categories: [createCategory('category-1')],
      })

      await expect(
        getCategory(repository, 'category-missing'),
      ).resolves.toBeNull()
    })

    it('已软删除的分类按 ID 读取返回 null', async () => {
      const repository = await harness.create({
        categories: [
          createCategory('category-gone', {
            status: 'DELETED',
            deleted_by: 'user-1',
            deleted_at: '2026-07-30T05:00:00.000Z',
          }),
        ],
      })

      await expect(
        getCategory(repository, 'category-gone'),
      ).resolves.toBeNull()
    })

    it('已停用的分类仍可按 ID 读取', async () => {
      const repository = await harness.create({
        categories: [createCategory('category-off', { status: 'DISABLED' })],
      })

      await expect(
        getCategory(repository, 'category-off'),
      ).resolves.toMatchObject({ status: 'DISABLED' })
    })

    it('按规范化名精确匹配分类', async () => {
      const repository = await harness.create({
        categories: [
          createCategory('category-1', { normalized_name: '折叠桌' }),
          createCategory('category-2', { normalized_name: '折叠桌椅' }),
        ],
      })

      await expect(
        getCategoryByNormalizedName(repository, '折叠桌'),
      ).resolves.toMatchObject({ _id: 'category-1' })
    })

    it('规范化名无匹配时返回 null', async () => {
      const repository = await harness.create({
        categories: [createCategory('category-1', { normalized_name: '折叠桌' })],
      })

      await expect(
        getCategoryByNormalizedName(repository, '折叠'),
      ).resolves.toBeNull()
    })

    it('已软删除的分类不再占用规范化名', async () => {
      const repository = await harness.create({
        categories: [
          createCategory('category-gone', {
            normalized_name: '折叠桌',
            status: 'DELETED',
            deleted_at: '2026-07-30T05:00:00.000Z',
          }),
        ],
      })

      await expect(
        getCategoryByNormalizedName(repository, '折叠桌'),
      ).resolves.toBeNull()
    })

    it('已停用的分类仍占用规范化名', async () => {
      const repository = await harness.create({
        categories: [
          createCategory('category-off', {
            normalized_name: '折叠桌',
            status: 'DISABLED',
          }),
        ],
      })

      await expect(
        getCategoryByNormalizedName(repository, '折叠桌'),
      ).resolves.toMatchObject({ _id: 'category-off' })
    })

    it('存在未删除的物品引用时返回 true', async () => {
      const repository = await harness.create({
        categories: [createCategory('category-1')],
        items: [
          createItem('item-live', { category_id: 'category-1' }),
          createItem('item-gone', {
            category_id: 'category-1',
            status: 'DELETED',
            deleted_at: '2026-07-30T05:00:00.000Z',
          }),
        ],
      })

      await expect(hasItemReference(repository, 'category-1')).resolves.toBe(
        true,
      )
    })

    it('待离库与已下架物品同样算作引用', async () => {
      const repository = await harness.create({
        categories: [createCategory('category-1'), createCategory('category-2')],
        items: [
          createItem('item-pending', {
            category_id: 'category-1',
            status: 'OUTBOUND_PENDING',
          }),
          createItem('item-off', {
            category_id: 'category-2',
            status: 'OFF_SHELF',
          }),
        ],
      })

      await expect(hasItemReference(repository, 'category-1')).resolves.toBe(
        true,
      )
      await expect(hasItemReference(repository, 'category-2')).resolves.toBe(
        true,
      )
    })

    it('引用该分类的物品全部软删除后返回 false', async () => {
      const repository = await harness.create({
        categories: [createCategory('category-1')],
        items: [
          createItem('item-1', {
            category_id: 'category-1',
            status: 'DELETED',
            deleted_at: '2026-07-30T05:00:00.000Z',
          }),
          createItem('item-2', {
            category_id: 'category-1',
            status: 'DELETED',
            deleted_at: '2026-07-30T06:00:00.000Z',
          }),
        ],
      })

      await expect(hasItemReference(repository, 'category-1')).resolves.toBe(
        false,
      )
    })

    it('只被其他分类的物品引用时返回 false', async () => {
      const repository = await harness.create({
        categories: [createCategory('category-1'), createCategory('category-2')],
        items: [createItem('item-1', { category_id: 'category-2' })],
      })

      await expect(hasItemReference(repository, 'category-1')).resolves.toBe(
        false,
      )
    })

    it('没有任何物品时返回 false', async () => {
      const repository = await harness.create({
        categories: [createCategory('category-1')],
      })

      await expect(hasItemReference(repository, 'category-1')).resolves.toBe(
        false,
      )
    })

    it('只列出启用中的分类', async () => {
      const repository = await harness.create({
        categories: [
          createCategory('category-active'),
          createCategory('category-off', { status: 'DISABLED' }),
          createCategory('category-gone', {
            status: 'DELETED',
            deleted_at: '2026-07-30T05:00:00.000Z',
          }),
        ],
      })

      await expect(listActiveCategories(repository).then(sortedIds)).resolves.toEqual(
        ['category-active'],
      )
    })

    it('列出全部分类时包含停用但不含已删除', async () => {
      const repository = await harness.create({
        categories: [
          createCategory('category-active'),
          createCategory('category-off', { status: 'DISABLED' }),
          createCategory('category-gone', {
            status: 'DELETED',
            deleted_at: '2026-07-30T05:00:00.000Z',
          }),
        ],
      })

      await expect(listAllCategories(repository).then(sortedIds)).resolves.toEqual(
        ['category-active', 'category-off'],
      )
    })

    it('写入新分类后可按 ID 与规范化名读回', async () => {
      const repository = await harness.create()

      await setCategory(
        repository,
        createCategory('category-new', {
          name: '折叠桌',
          normalized_name: '折叠桌',
          item_reference_count: 4,
          created_by: 'user-1',
        }),
      )

      await expect(
        getCategory(repository, 'category-new'),
      ).resolves.toMatchObject({
        _id: 'category-new',
        name: '折叠桌',
        normalized_name: '折叠桌',
        status: 'ACTIVE',
        is_preset: false,
        item_reference_count: 4,
        created_by: 'user-1',
      })
      await expect(
        getCategoryByNormalizedName(repository, '折叠桌'),
      ).resolves.toMatchObject({ _id: 'category-new' })
      await expect(listActiveCategories(repository).then(sortedIds)).resolves.toEqual(
        ['category-new'],
      )
    })

    it('写入同 ID 分类时更新既有记录且旧规范化名不再命中', async () => {
      const repository = await harness.create({
        categories: [
          createCategory('category-1', {
            name: '折叠桌',
            normalized_name: '折叠桌',
          }),
        ],
      })

      await setCategory(
        repository,
        createCategory('category-1', {
          name: '会议桌',
          normalized_name: '会议桌',
          status: 'DISABLED',
        }),
      )

      await expect(
        getCategory(repository, 'category-1'),
      ).resolves.toMatchObject({ name: '会议桌', status: 'DISABLED' })
      await expect(
        getCategoryByNormalizedName(repository, '折叠桌'),
      ).resolves.toBeNull()
      await expect(
        getCategoryByNormalizedName(repository, '会议桌'),
      ).resolves.toMatchObject({ _id: 'category-1' })
      await expect(listAllCategories(repository)).resolves.toHaveLength(1)
    })

    it('写入分类时整体替换记录而不是与旧值合并', async () => {
      const repository = await harness.create({
        categories: [
          createCategory('category-1', {
            item_reference_count: 9,
            created_by: 'user-1',
          }),
        ],
      })

      await setCategory(repository, createBareCategory('category-1'))

      const record = await getCategory(repository, 'category-1')
      expect(record).toMatchObject({ _id: 'category-1', is_preset: true })
      expect(record?.created_by ?? null).toBeNull()
      expect(record?.item_reference_count ?? null).toBeNull()
    })

    it('缺省可选字段的分类往返后仍视为未设置', async () => {
      const repository = await harness.create()

      await setCategory(repository, createBareCategory('category-preset'))

      const record = await getCategory(repository, 'category-preset')
      expect(record).toMatchObject({
        _id: 'category-preset',
        status: 'ACTIVE',
        is_preset: true,
        sort_order: 3,
      })
      expect(record?.created_by ?? null).toBeNull()
      expect(record?.item_reference_count ?? null).toBeNull()

      const listed = await listAllCategories(repository)
      expect(listed).toHaveLength(1)
      expect(listed[0]?.created_by ?? null).toBeNull()
      expect(listed[0]?.item_reference_count ?? null).toBeNull()
    })

    it('事务提交后写入可见', async () => {
      const repository = await harness.create({
        categories: [createCategory('category-1', { status: 'ACTIVE' })],
      })

      await repository.runTransaction(async (unitOfWork) => {
        const category = await unitOfWork.getCategory('category-1')
        await unitOfWork.setCategory({ ...category!, status: 'DISABLED' })
      })

      await expect(
        getCategory(repository, 'category-1'),
      ).resolves.toMatchObject({ status: 'DISABLED' })
    })

    it('事务抛出异常时全部写入回滚', async () => {
      const repository = await harness.create({
        categories: [createCategory('category-1', { status: 'ACTIVE' })],
      })

      await expect(
        repository.runTransaction(async (unitOfWork) => {
          const category = await unitOfWork.getCategory('category-1')
          await unitOfWork.setCategory({ ...category!, status: 'DISABLED' })
          await unitOfWork.setCategory(createCategory('category-2'))
          throw new Error('模拟事务失败')
        }),
      ).rejects.toThrow('模拟事务失败')

      await expect(
        getCategory(repository, 'category-1'),
      ).resolves.toMatchObject({ status: 'ACTIVE' })
      await expect(getCategory(repository, 'category-2')).resolves.toBeNull()
      await expect(listAllCategories(repository)).resolves.toHaveLength(1)
    })

    it('事务内可读到本事务尚未提交的写入', async () => {
      const repository = await harness.create({
        categories: [createCategory('category-1', { status: 'ACTIVE' })],
      })

      const seen = await repository.runTransaction(async (unitOfWork) => {
        const category = await unitOfWork.getCategory('category-1')
        await unitOfWork.setCategory({
          ...category!,
          name: '会议桌',
          normalized_name: '会议桌',
          status: 'DISABLED',
        })
        return {
          byId: await unitOfWork.getCategory('category-1'),
          byName: await unitOfWork.getCategoryByNormalizedName('会议桌'),
          all: await unitOfWork.listAllCategories(),
        }
      })

      expect(seen.byId).toMatchObject({ status: 'DISABLED' })
      expect(seen.byName).toMatchObject({ _id: 'category-1' })
      expect(seen.all).toHaveLength(1)
    })
  })
}
