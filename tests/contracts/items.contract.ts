import { describe, expect, it } from 'vitest'

import type { ItemRepository } from '../../cloudfunctions/api/src/items/repository'
import type { ItemRecord } from '../../cloudfunctions/api/src/items/types'
import {
  createCategory,
  createItem,
  createOperationLog,
  createUser,
  type RepositoryHarness,
} from './support'

function itemsAt(times: string[]): ItemRecord[] {
  return times.map((time, index) =>
    createItem(`item-${String(index).padStart(2, '0')}`, {
      updated_at: time,
    }),
  )
}

async function drainPages(
  repository: ItemRepository,
  limit: number,
): Promise<string[]> {
  const collected: string[] = []
  let cursor: { updatedAt: string; id: string } | undefined
  for (let page = 0; page < 50; page += 1) {
    const records: ItemRecord[] = await repository.listItems({
      limit,
      ...(cursor ? { cursor } : {}),
    })
    if (records.length === 0) {
      break
    }
    collected.push(...records.map((record) => record._id))
    const last = records[records.length - 1]!
    cursor = { updatedAt: last.updated_at, id: last._id }
    if (records.length < limit) {
      break
    }
  }
  return collected
}

export function describeItemRepositoryContract(
  harness: RepositoryHarness<ItemRepository>,
): void {
  describe(`ItemRepository 契约（${harness.name}）`, () => {
    it('按更新时间与 ID 倒序返回物品', async () => {
      const repository = await harness.create({
        items: itemsAt([
          '2026-07-30T01:00:00.000Z',
          '2026-07-30T03:00:00.000Z',
          '2026-07-30T02:00:00.000Z',
        ]),
      })

      const records = await repository.listItems({ limit: 10 })

      expect(records.map((record) => record._id)).toEqual([
        'item-01',
        'item-02',
        'item-00',
      ])
    })

    it('更新时间完全相同时按 ID 倒序作为次级排序', async () => {
      const repository = await harness.create({
        items: itemsAt(Array.from({ length: 5 }, () => '2026-07-30T04:00:00.000Z')),
      })

      const records = await repository.listItems({ limit: 10 })

      expect(records.map((record) => record._id)).toEqual([
        'item-04',
        'item-03',
        'item-02',
        'item-01',
        'item-00',
      ])
    })

    it('游标分页在更新时间大量重复时不重不漏', async () => {
      const repository = await harness.create({
        items: itemsAt([
          ...Array.from({ length: 8 }, () => '2026-07-30T04:00:00.000Z'),
          ...Array.from({ length: 4 }, () => '2026-07-30T03:00:00.000Z'),
        ]),
      })

      const paged = await drainPages(repository, 5)

      expect(paged).toHaveLength(12)
      expect(new Set(paged).size).toBe(12)
      const full = await repository.listItems({ limit: 20 })
      expect(paged).toEqual(full.map((record) => record._id))
    })

    it('默认只返回在库与待离库物品', async () => {
      const repository = await harness.create({
        items: [
          createItem('item-active', { status: 'ACTIVE' }),
          createItem('item-pending', { status: 'OUTBOUND_PENDING' }),
          createItem('item-off', { status: 'OFF_SHELF' }),
        ],
      })

      const records = await repository.listItems({ limit: 10 })

      expect(records.map((record) => record._id).sort()).toEqual([
        'item-active',
        'item-pending',
      ])
    })

    it('按状态筛选时只返回该状态的物品', async () => {
      const repository = await harness.create({
        items: [
          createItem('item-active', { status: 'ACTIVE' }),
          createItem('item-off', { status: 'OFF_SHELF' }),
        ],
      })

      const records = await repository.listItems({
        limit: 10,
        status: 'OFF_SHELF',
      })

      expect(records.map((record) => record._id)).toEqual(['item-off'])
    })

    it('已删除物品不出现在任何查询中', async () => {
      const repository = await harness.create({
        items: [
          createItem('item-live', { status: 'OFF_SHELF' }),
          createItem('item-gone', {
            status: 'DELETED',
            deleted_at: '2026-07-30T05:00:00.000Z',
          }),
        ],
      })

      await expect(repository.getItem('item-gone')).resolves.toBeNull()
      await expect(
        repository.listItems({ limit: 10, status: 'OFF_SHELF' }),
      ).resolves.toHaveLength(1)
    })

    it('按分类筛选', async () => {
      const repository = await harness.create({
        items: [
          createItem('item-a', { category_id: 'category-1' }),
          createItem('item-b', { category_id: 'category-2' }),
        ],
      })

      const records = await repository.listItems({
        limit: 10,
        categoryId: 'category-2',
      })

      expect(records.map((record) => record._id)).toEqual(['item-b'])
    })

    it('关键词匹配名称、描述与公开编码且忽略大小写', async () => {
      const repository = await harness.create({
        items: [
          createItem('item-name', { name: '折叠桌' }),
          createItem('item-desc', { name: '甲', description: '活动折叠使用' }),
          createItem('item-code', { name: '乙', code: 'ABCDEF123456' }),
          createItem('item-none', { name: '丙', description: '无关' }),
        ],
      })

      await expect(
        repository.listItems({ limit: 10, keyword: '折叠' }),
      ).resolves.toHaveLength(2)
      await expect(
        repository.listItems({ limit: 10, keyword: 'abcdef' }),
      ).resolves.toHaveLength(1)
    })

    it('关键词中的通配符与正则元字符按字面量处理', async () => {
      const repository = await harness.create({
        items: [
          createItem('item-literal', { name: '报销单 100% 完成' }),
          createItem('item-other', { name: '报销单 50 完成' }),
          createItem('item-underscore', { name: 'a_b' }),
          createItem('item-plain', { name: 'axb' }),
        ],
      })

      await expect(
        repository.listItems({ limit: 10, keyword: '100%' }),
      ).resolves.toHaveLength(1)
      const underscore = await repository.listItems({
        limit: 10,
        keyword: 'a_b',
      })
      expect(underscore.map((record) => record._id)).toEqual([
        'item-underscore',
      ])
    })

    it('limit 限制返回数量且截断发生在排序之后', async () => {
      const repository = await harness.create({
        items: itemsAt([
          '2026-07-30T01:00:00.000Z',
          '2026-07-30T05:00:00.000Z',
          '2026-07-30T02:00:00.000Z',
          '2026-07-30T04:00:00.000Z',
        ]),
      })

      const records = await repository.listItems({ limit: 2 })

      expect(records.map((record) => record._id)).toEqual([
        'item-01',
        'item-03',
      ])
    })

    it('批量读取分类与用户时去重且跳过不存在的 ID', async () => {
      const repository = await harness.create({
        categories: [createCategory('category-1'), createCategory('category-2')],
        users: [createUser('user-1')],
      })

      await expect(
        repository.getCategoriesByIds([
          'category-1',
          'category-1',
          'category-missing',
        ]),
      ).resolves.toHaveLength(1)
      await expect(
        repository.getUsersByIds(['user-1', 'user-1', 'user-missing']),
      ).resolves.toHaveLength(1)
    })

    it('操作日志按时间与 ID 倒序返回并限制在 100 条内', async () => {
      const repository = await harness.create({
        operationLogs: [
          createOperationLog('log-1', 'item-1', {
            created_at: '2026-07-30T01:00:00.000Z',
          }),
          createOperationLog('log-3', 'item-1', {
            created_at: '2026-07-30T03:00:00.000Z',
          }),
          createOperationLog('log-2', 'item-1', {
            created_at: '2026-07-30T02:00:00.000Z',
          }),
          createOperationLog('log-other', 'item-2'),
        ],
      })

      const logs = await repository.listOperationLogs('item-1')

      expect(logs.map((log) => log._id)).toEqual(['log-3', 'log-2', 'log-1'])
    })

    it('操作日志超过上限时保留最新的记录', async () => {
      const repository = await harness.create({
        operationLogs: Array.from({ length: 120 }, (_, index) =>
          createOperationLog(`log-${String(index).padStart(3, '0')}`, 'item-1', {
            created_at: `2026-07-30T${String(index % 24).padStart(2, '0')}:00:00.000Z`,
          }),
        ),
      })

      const logs = await repository.listOperationLogs('item-1')

      expect(logs).toHaveLength(100)
      expect(logs[0]?.created_at).toBe('2026-07-30T23:00:00.000Z')
    })

    it('事务提交后写入可见', async () => {
      const repository = await harness.create({
        items: [createItem('item-1', { version: 1 })],
      })

      await repository.runTransaction(async (unitOfWork) => {
        const item = await unitOfWork.getItem('item-1')
        await unitOfWork.setItem({ ...item!, version: 2 })
      })

      await expect(repository.getItem('item-1')).resolves.toMatchObject({
        version: 2,
      })
    })

    it('事务抛出异常时全部写入回滚', async () => {
      const repository = await harness.create({
        items: [createItem('item-1', { version: 1 })],
        categories: [createCategory('category-1')],
      })

      await expect(
        repository.runTransaction(async (unitOfWork) => {
          const item = await unitOfWork.getItem('item-1')
          await unitOfWork.setItem({ ...item!, version: 9 })
          await unitOfWork.setOperationLog(
            createOperationLog('log-new', 'item-1'),
          )
          throw new Error('模拟事务失败')
        }),
      ).rejects.toThrow('模拟事务失败')

      await expect(repository.getItem('item-1')).resolves.toMatchObject({
        version: 1,
      })
      await expect(
        repository.listOperationLogs('item-1'),
      ).resolves.toHaveLength(0)
    })

    it('事务内可读到本事务尚未提交的写入', async () => {
      const repository = await harness.create({
        items: [createItem('item-1', { version: 1 })],
      })

      const seen = await repository.runTransaction(async (unitOfWork) => {
        const item = await unitOfWork.getItem('item-1')
        await unitOfWork.setItem({ ...item!, version: 7 })
        return unitOfWork.getItem('item-1')
      })

      expect(seen).toMatchObject({ version: 7 })
    })
  })
}
