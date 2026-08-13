import { describe, expect, it } from 'vitest'

import type { ItemRecord } from '../../cloudfunctions/api/src/items/types'
import type {
  OutboundRepository,
  OutboundUnitOfWork,
} from '../../cloudfunctions/api/src/outbound/repository'
import type { OutboundRequestRecord } from '../../cloudfunctions/api/src/outbound/types'
import {
  createItem,
  createLabel,
  createOperationLog,
  createOutboundRequest,
  createUser,
  type RepositoryHarness,
} from './support'

function atHour(hour: number): string {
  return `2026-07-30T${String(hour).padStart(2, '0')}:00:00.000Z`
}

function read<T>(
  repository: OutboundRepository,
  operation: (unitOfWork: OutboundUnitOfWork) => Promise<T>,
): Promise<T> {
  return repository.runTransaction(operation)
}

function requestsAtHours(hours: number[]): OutboundRequestRecord[] {
  return hours.map((hour, index) =>
    createOutboundRequest(
      `request-${String(index).padStart(2, '0')}`,
      `item-${String(index).padStart(2, '0')}`,
      'user-1',
      { created_at: atHour(hour) },
    ),
  )
}

function withoutOffShelfFields(item: ItemRecord): ItemRecord {
  const next = { ...item }
  delete next.off_shelf_by
  delete next.off_shelf_at
  return next
}

export function describeOutboundRepositoryContract(
  harness: RepositoryHarness<OutboundRepository>,
): void {
  describe(`OutboundRepository 契约（${harness.name}）`, () => {
    it('只返回该物品处于待审批状态的申请', async () => {
      const repository = await harness.create({
        outboundRequests: [
          createOutboundRequest('request-rejected', 'item-1', 'user-1', {
            status: 'REJECTED',
            created_at: atHour(9),
          }),
          createOutboundRequest('request-pending', 'item-1', 'user-1', {
            created_at: atHour(1),
          }),
          createOutboundRequest('request-elsewhere', 'item-2', 'user-1', {
            created_at: atHour(10),
          }),
        ],
      })

      const record = await read(repository, (unitOfWork) =>
        unitOfWork.findPendingRequest('item-1'),
      )

      expect(record).toMatchObject({
        _id: 'request-pending',
        item_id: 'item-1',
        status: 'PENDING',
      })
    })

    it('物品只有已处理的历史申请时查不到待审批申请', async () => {
      const repository = await harness.create({
        outboundRequests: [
          createOutboundRequest('request-rejected', 'item-1', 'user-1', {
            status: 'REJECTED',
          }),
          createOutboundRequest('request-approved', 'item-1', 'user-1', {
            status: 'APPROVED',
          }),
          createOutboundRequest('request-other', 'item-2', 'user-1'),
        ],
      })

      await expect(
        read(repository, (unitOfWork) => unitOfWork.findPendingRequest('item-1')),
      ).resolves.toBeNull()
    })

    it('待审批列表只包含待审批申请', async () => {
      const repository = await harness.create({
        outboundRequests: [
          createOutboundRequest('request-pending-1', 'item-1', 'user-1'),
          createOutboundRequest('request-pending-2', 'item-2', 'user-2'),
          createOutboundRequest('request-approved', 'item-3', 'user-1', {
            status: 'APPROVED',
          }),
          createOutboundRequest('request-rejected', 'item-4', 'user-1', {
            status: 'REJECTED',
          }),
        ],
      })

      const records = await read(repository, (unitOfWork) =>
        unitOfWork.listPendingRequests(10),
      )

      expect(records.map((record) => record._id).sort()).toEqual([
        'request-pending-1',
        'request-pending-2',
      ])
    })

    it('待审批列表按创建时间与 ID 倒序返回', async () => {
      const repository = await harness.create({
        outboundRequests: requestsAtHours([1, 3, 3, 2]),
      })

      const records = await read(repository, (unitOfWork) =>
        unitOfWork.listPendingRequests(10),
      )

      expect(records.map((record) => record._id)).toEqual([
        'request-02',
        'request-01',
        'request-03',
        'request-00',
      ])
    })

    it('待审批列表的 limit 截断发生在排序之后', async () => {
      const repository = await harness.create({
        outboundRequests: requestsAtHours([3, 9, 1, 11, 5, 0, 7, 2, 10, 4, 8, 6]),
      })

      const records = await read(repository, (unitOfWork) =>
        unitOfWork.listPendingRequests(5),
      )

      expect(records.map((record) => record._id)).toEqual([
        'request-03',
        'request-08',
        'request-01',
        'request-10',
        'request-06',
      ])
    })

    it('申请人列表返回该申请人全部状态的申请并按创建时间与 ID 倒序', async () => {
      const repository = await harness.create({
        outboundRequests: [
          createOutboundRequest('request-00', 'item-1', 'user-1', {
            created_at: atHour(1),
          }),
          createOutboundRequest('request-01', 'item-2', 'user-1', {
            status: 'APPROVED',
            created_at: atHour(3),
          }),
          createOutboundRequest('request-02', 'item-3', 'user-1', {
            status: 'REJECTED',
            created_at: atHour(3),
          }),
          createOutboundRequest('request-03', 'item-4', 'user-1', {
            created_at: atHour(2),
          }),
          createOutboundRequest('request-other', 'item-5', 'user-2', {
            created_at: atHour(9),
          }),
        ],
      })

      const records = await read(repository, (unitOfWork) =>
        unitOfWork.listRequestsByApplicant('user-1', 10),
      )

      expect(records.map((record) => record._id)).toEqual([
        'request-02',
        'request-01',
        'request-03',
        'request-00',
      ])
      expect(records.map((record) => record.status).sort()).toEqual([
        'APPROVED',
        'PENDING',
        'PENDING',
        'REJECTED',
      ])
    })

    it('申请人列表的 limit 截断发生在排序之后', async () => {
      const repository = await harness.create({
        outboundRequests: [
          ...requestsAtHours([3, 9, 1, 11, 5, 0, 7, 2, 10, 4, 8, 6]),
          createOutboundRequest('request-other-1', 'item-other-1', 'user-2', {
            created_at: atHour(23),
          }),
          createOutboundRequest('request-other-2', 'item-other-2', 'user-2', {
            created_at: atHour(22),
          }),
        ],
      })

      const records = await read(repository, (unitOfWork) =>
        unitOfWork.listRequestsByApplicant('user-1', 5),
      )

      expect(records.map((record) => record._id)).toEqual([
        'request-03',
        'request-08',
        'request-01',
        'request-10',
        'request-06',
      ])
    })

    it('按 ID 读取申请时保留审批字段，ID 不存在时返回 null', async () => {
      const repository = await harness.create({
        outboundRequests: [
          createOutboundRequest('request-1', 'item-1', 'user-1', {
            status: 'APPROVED',
            reviewer_id: 'user-2',
            review_summary: '同意离库',
            reviewed_at: atHour(8),
          }),
        ],
      })

      const state = await read(repository, async (unitOfWork) => ({
        found: await unitOfWork.getRequest('request-1'),
        missing: await unitOfWork.getRequest('request-missing'),
      }))

      expect(state.found).toMatchObject({
        _id: 'request-1',
        item_id: 'item-1',
        applicant_id: 'user-1',
        status: 'APPROVED',
        reviewer_id: 'user-2',
        review_summary: '同意离库',
        reviewed_at: atHour(8),
      })
      expect(state.missing).toBeNull()
    })

    it('已软删除的物品读取时返回 null', async () => {
      const repository = await harness.create({
        items: [
          createItem('item-live', { status: 'OFF_SHELF' }),
          createItem('item-gone', {
            status: 'DELETED',
            deleted_by: 'user-1',
            deleted_at: atHour(5),
          }),
        ],
      })

      const state = await read(repository, async (unitOfWork) => ({
        live: await unitOfWork.getItem('item-live'),
        deleted: await unitOfWork.getItem('item-gone'),
        missing: await unitOfWork.getItem('item-missing'),
      }))

      expect(state.live).toMatchObject({ _id: 'item-live' })
      expect(state.deleted).toBeNull()
      expect(state.missing).toBeNull()
    })

    it('按物品 ID 读取标签，物品没有标签时返回 null', async () => {
      const repository = await harness.create({
        labels: [
          createLabel('item-1', { public_code: 'A1B2C3D4E5F6' }),
          createLabel('item-2', { public_code: 'B2C3D4E5F6A1' }),
        ],
      })

      const state = await read(repository, async (unitOfWork) => ({
        found: await unitOfWork.getLabelByItemId('item-1'),
        missing: await unitOfWork.getLabelByItemId('item-3'),
      }))

      expect(state.found).toMatchObject({
        _id: 'item-label-item-1',
        item_id: 'item-1',
        public_code: 'A1B2C3D4E5F6',
      })
      expect(state.missing).toBeNull()
    })

    it('按 ID 读取用户时不过滤审批状态，ID 不存在时返回 null', async () => {
      const repository = await harness.create({
        users: [
          createUser('user-1', { role: 'MANAGER' }),
          createUser('user-2', { status: 'PENDING' }),
        ],
      })

      const state = await read(repository, async (unitOfWork) => ({
        approved: await unitOfWork.getUser('user-1'),
        pending: await unitOfWork.getUser('user-2'),
        missing: await unitOfWork.getUser('user-missing'),
      }))

      expect(state.approved).toMatchObject({ _id: 'user-1', role: 'MANAGER' })
      expect(state.pending).toMatchObject({ _id: 'user-2', status: 'PENDING' })
      expect(state.missing).toBeNull()
    })

    it('事务提交后写入可见', async () => {
      const repository = await harness.create({
        items: [createItem('item-1', { status: 'OUTBOUND_PENDING', version: 1 })],
        labels: [createLabel('item-1', { status: 'READY' })],
        outboundRequests: [
          createOutboundRequest('request-1', 'item-1', 'user-1'),
        ],
      })

      await repository.runTransaction(async (unitOfWork) => {
        const item = await unitOfWork.getItem('item-1')
        const request = await unitOfWork.getRequest('request-1')
        const label = await unitOfWork.getLabelByItemId('item-1')
        await unitOfWork.setItem({
          ...item!,
          status: 'OFF_SHELF',
          version: 2,
          off_shelf_by: 'user-2',
          off_shelf_at: atHour(8),
        })
        await unitOfWork.setRequest({
          ...request!,
          status: 'APPROVED',
          reviewer_id: 'user-2',
          reviewed_at: atHour(8),
        })
        await unitOfWork.setLabel({ ...label!, status: 'VOID' })
      })

      const state = await read(repository, async (unitOfWork) => ({
        item: await unitOfWork.getItem('item-1'),
        request: await unitOfWork.getRequest('request-1'),
        label: await unitOfWork.getLabelByItemId('item-1'),
        pending: await unitOfWork.findPendingRequest('item-1'),
      }))

      expect(state.item).toMatchObject({
        status: 'OFF_SHELF',
        version: 2,
        off_shelf_by: 'user-2',
        off_shelf_at: atHour(8),
      })
      expect(state.request).toMatchObject({
        status: 'APPROVED',
        reviewer_id: 'user-2',
      })
      expect(state.label).toMatchObject({ status: 'VOID' })
      expect(state.pending).toBeNull()
    })

    it('事务抛出异常时全部写入回滚', async () => {
      const repository = await harness.create({
        users: [createUser('user-1'), createUser('user-3')],
        items: [createItem('item-1', { status: 'ACTIVE', version: 1 })],
        labels: [createLabel('item-1', { status: 'READY' })],
        outboundRequests: [
          createOutboundRequest('request-1', 'item-1', 'user-1'),
        ],
      })

      await expect(
        repository.runTransaction(async (unitOfWork) => {
          const item = await unitOfWork.getItem('item-1')
          const request = await unitOfWork.getRequest('request-1')
          const label = await unitOfWork.getLabelByItemId('item-1')
          await unitOfWork.setItem({
            ...item!,
            status: 'OFF_SHELF',
            version: 2,
            off_shelf_by: 'user-2',
            off_shelf_at: atHour(8),
          })
          await unitOfWork.setRequest({ ...request!, status: 'APPROVED' })
          await unitOfWork.setRequest(
            createOutboundRequest('request-new', 'item-1', 'user-3'),
          )
          await unitOfWork.setLabel({ ...label!, status: 'VOID' })
          await unitOfWork.setOperationLog(
            createOperationLog('log-new', 'item-1', {
              action_type: 'OUTBOUND_APPROVE',
              commit_summary: '同意离库',
            }),
          )
          throw new Error('模拟事务失败')
        }),
      ).rejects.toThrow('模拟事务失败')

      const state = await read(repository, async (unitOfWork) => ({
        item: await unitOfWork.getItem('item-1'),
        request: await unitOfWork.getRequest('request-1'),
        created: await unitOfWork.getRequest('request-new'),
        label: await unitOfWork.getLabelByItemId('item-1'),
        pending: await unitOfWork.listPendingRequests(10),
      }))

      expect(state.item).toMatchObject({ status: 'ACTIVE', version: 1 })
      expect(state.item?.off_shelf_by ?? null).toBeNull()
      expect(state.item?.off_shelf_at ?? null).toBeNull()
      expect(state.request).toMatchObject({ status: 'PENDING' })
      expect(state.created).toBeNull()
      expect(state.label).toMatchObject({ status: 'READY' })
      expect(state.pending.map((record) => record._id)).toEqual(['request-1'])
    })

    it('事务内可读到本事务尚未提交的写入', async () => {
      const repository = await harness.create({
        users: [createUser('user-1')],
        items: [createItem('item-1', { status: 'ACTIVE', version: 1 })],
        labels: [createLabel('item-1', { status: 'READY' })],
      })

      const seen = await repository.runTransaction(async (unitOfWork) => {
        const item = await unitOfWork.getItem('item-1')
        const label = await unitOfWork.getLabelByItemId('item-1')
        await unitOfWork.setItem({
          ...item!,
          status: 'OUTBOUND_PENDING',
          version: 2,
        })
        await unitOfWork.setRequest(
          createOutboundRequest('request-new', 'item-1', 'user-1', {
            created_at: atHour(6),
          }),
        )
        await unitOfWork.setLabel({ ...label!, status: 'VOID' })
        return {
          item: await unitOfWork.getItem('item-1'),
          request: await unitOfWork.getRequest('request-new'),
          pending: await unitOfWork.findPendingRequest('item-1'),
          mine: await unitOfWork.listRequestsByApplicant('user-1', 10),
          label: await unitOfWork.getLabelByItemId('item-1'),
        }
      })

      expect(seen.item).toMatchObject({
        status: 'OUTBOUND_PENDING',
        version: 2,
      })
      expect(seen.request).toMatchObject({ _id: 'request-new' })
      expect(seen.pending).toMatchObject({ _id: 'request-new' })
      expect(seen.mine.map((record) => record._id)).toEqual(['request-new'])
      expect(seen.label).toMatchObject({ status: 'VOID' })
    })

    it('写入不含离库字段的物品后回读离库字段为空', async () => {
      const repository = await harness.create({
        items: [
          createItem('item-1', {
            status: 'OFF_SHELF',
            version: 3,
            off_shelf_by: 'user-2',
            off_shelf_at: atHour(8),
          }),
        ],
      })

      await repository.runTransaction(async (unitOfWork) => {
        const item = await unitOfWork.getItem('item-1')
        await unitOfWork.setItem({
          ...withoutOffShelfFields(item!),
          status: 'ACTIVE',
          version: 4,
          updated_by: 'user-2',
          updated_at: atHour(9),
        })
      })

      const record = await read(repository, (unitOfWork) =>
        unitOfWork.getItem('item-1'),
      )

      expect(record).toMatchObject({ status: 'ACTIVE', version: 4 })
      expect(record?.off_shelf_by ?? null).toBeNull()
      expect(record?.off_shelf_at ?? null).toBeNull()
    })
  })
}
