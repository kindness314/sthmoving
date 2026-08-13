import { describe, expect, it } from 'vitest'

import type { ItemRecord } from '../../cloudfunctions/api/src/items/types'
import type { LabelRepository } from '../../cloudfunctions/api/src/labels/repository'
import type { ItemLabelRecord } from '../../cloudfunctions/api/src/labels/types'
import type { UserRecord } from '../../cloudfunctions/api/src/membership/types'
import {
  createItem,
  createLabel,
  createUser,
  type RepositoryHarness,
} from './support'

function createBareLabel(itemId: string, publicCode: string): ItemLabelRecord {
  return {
    _id: `item-label-${itemId}`,
    item_id: itemId,
    public_code: publicCode,
    page: 'pages/item-detail/index',
    scene: `i=${publicCode}`,
    status: 'PENDING',
    attempt_count: 0,
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
  }
}

function getLabelByItemId(
  repository: LabelRepository,
  itemId: string,
): Promise<ItemLabelRecord | null> {
  return repository.runTransaction((unitOfWork) =>
    unitOfWork.getLabelByItemId(itemId),
  )
}

function getLabelByPublicCode(
  repository: LabelRepository,
  publicCode: string,
): Promise<ItemLabelRecord | null> {
  return repository.runTransaction((unitOfWork) =>
    unitOfWork.getLabelByPublicCode(publicCode),
  )
}

function getItem(
  repository: LabelRepository,
  itemId: string,
): Promise<ItemRecord | null> {
  return repository.runTransaction((unitOfWork) => unitOfWork.getItem(itemId))
}

function getUser(
  repository: LabelRepository,
  userId: string,
): Promise<UserRecord | null> {
  return repository.runTransaction((unitOfWork) => unitOfWork.getUser(userId))
}

function setLabel(
  repository: LabelRepository,
  label: ItemLabelRecord,
): Promise<void> {
  return repository.runTransaction((unitOfWork) => unitOfWork.setLabel(label))
}

export function describeLabelRepositoryContract(
  harness: RepositoryHarness<LabelRepository>,
): void {
  describe(`LabelRepository 契约（${harness.name}）`, () => {
    it('按物品 ID 读取标签返回完整记录', async () => {
      const repository = await harness.create({
        labels: [
          createLabel('item-1', {
            public_code: 'A1B2C3D4E5F6',
            scene: 'i=A1B2C3D4E5F6',
            status: 'READY',
            attempt_count: 2,
            file_id: 'cloud://label-1.png',
            generated_at: '2026-07-30T01:00:00.000Z',
          }),
        ],
      })

      await expect(getLabelByItemId(repository, 'item-1')).resolves.toMatchObject(
        {
          _id: 'item-label-item-1',
          item_id: 'item-1',
          public_code: 'A1B2C3D4E5F6',
          page: 'pages/item-detail/index',
          scene: 'i=A1B2C3D4E5F6',
          status: 'READY',
          attempt_count: 2,
          file_id: 'cloud://label-1.png',
          generated_at: '2026-07-30T01:00:00.000Z',
        },
      )
    })

    it('物品没有标签时按物品 ID 读取返回 null', async () => {
      const repository = await harness.create({
        labels: [createLabel('item-1')],
      })

      await expect(getLabelByItemId(repository, 'item-2')).resolves.toBeNull()
    })

    it('按公开编码读取标签', async () => {
      const repository = await harness.create({
        labels: [createLabel('item-1', { public_code: 'A1B2C3D4E5F6' })],
      })

      await expect(
        getLabelByPublicCode(repository, 'A1B2C3D4E5F6'),
      ).resolves.toMatchObject({ item_id: 'item-1' })
    })

    it('公开编码不存在时返回 null', async () => {
      const repository = await harness.create({
        labels: [createLabel('item-1', { public_code: 'A1B2C3D4E5F6' })],
      })

      await expect(
        getLabelByPublicCode(repository, 'FFFFFFFFFFFF'),
      ).resolves.toBeNull()
    })

    it('不同物品的公开编码互不干扰', async () => {
      const repository = await harness.create({
        labels: [
          createLabel('item-1', {
            public_code: 'A1B2C3D4E5F6',
            scene: 'i=A1B2C3D4E5F6',
          }),
          createLabel('item-2', {
            public_code: '0123456789AB',
            scene: 'i=0123456789AB',
          }),
        ],
      })

      await expect(
        getLabelByPublicCode(repository, 'A1B2C3D4E5F6'),
      ).resolves.toMatchObject({ item_id: 'item-1' })
      await expect(
        getLabelByPublicCode(repository, '0123456789AB'),
      ).resolves.toMatchObject({ item_id: 'item-2' })
      await expect(getLabelByItemId(repository, 'item-2')).resolves.toMatchObject(
        { public_code: '0123456789AB' },
      )
    })

    it('按 ID 读取在库物品', async () => {
      const repository = await harness.create({
        items: [createItem('item-1', { name: '折叠桌' })],
      })

      await expect(getItem(repository, 'item-1')).resolves.toMatchObject({
        _id: 'item-1',
        name: '折叠桌',
        status: 'ACTIVE',
      })
    })

    it('读取不存在的物品返回 null', async () => {
      const repository = await harness.create({
        items: [createItem('item-1')],
      })

      await expect(getItem(repository, 'item-missing')).resolves.toBeNull()
    })

    it('已软删除的物品返回 null', async () => {
      const repository = await harness.create({
        items: [
          createItem('item-gone', {
            status: 'DELETED',
            deleted_by: 'user-1',
            deleted_at: '2026-07-30T05:00:00.000Z',
          }),
        ],
        labels: [createLabel('item-gone')],
      })

      await expect(getItem(repository, 'item-gone')).resolves.toBeNull()
      await expect(
        getLabelByItemId(repository, 'item-gone'),
      ).resolves.toMatchObject({ item_id: 'item-gone' })
    })

    it('已下架的物品仍可读取', async () => {
      const repository = await harness.create({
        items: [
          createItem('item-off', {
            status: 'OFF_SHELF',
            off_shelf_at: '2026-07-30T05:00:00.000Z',
          }),
        ],
      })

      await expect(getItem(repository, 'item-off')).resolves.toMatchObject({
        status: 'OFF_SHELF',
      })
    })

    it('按 ID 读取用户', async () => {
      const repository = await harness.create({
        users: [createUser('user-1', { display_name: '张三', role: 'ADMIN' })],
      })

      await expect(getUser(repository, 'user-1')).resolves.toMatchObject({
        _id: 'user-1',
        display_name: '张三',
        role: 'ADMIN',
        status: 'APPROVED',
      })
    })

    it('读取不存在的用户返回 null', async () => {
      const repository = await harness.create({
        users: [createUser('user-1')],
      })

      await expect(getUser(repository, 'user-missing')).resolves.toBeNull()
    })

    it('未通过审核的用户仍可读取', async () => {
      const repository = await harness.create({
        users: [createUser('user-pending', { status: 'PENDING' })],
      })

      await expect(getUser(repository, 'user-pending')).resolves.toMatchObject({
        status: 'PENDING',
      })
    })

    it('写入新标签后可按物品 ID 与公开编码读回', async () => {
      const repository = await harness.create({
        items: [createItem('item-1')],
      })

      await setLabel(
        repository,
        createLabel('item-1', {
          public_code: 'A1B2C3D4E5F6',
          scene: 'i=A1B2C3D4E5F6',
          status: 'PENDING',
          attempt_count: 1,
          generation_token: 'token-1',
        }),
      )

      await expect(getLabelByItemId(repository, 'item-1')).resolves.toMatchObject(
        {
          _id: 'item-label-item-1',
          item_id: 'item-1',
          public_code: 'A1B2C3D4E5F6',
          status: 'PENDING',
          attempt_count: 1,
          generation_token: 'token-1',
        },
      )
      await expect(
        getLabelByPublicCode(repository, 'A1B2C3D4E5F6'),
      ).resolves.toMatchObject({ item_id: 'item-1' })
    })

    it('同一物品重复写入时始终只保留一条标签', async () => {
      const repository = await harness.create({
        labels: [
          createLabel('item-1', {
            public_code: 'A1B2C3D4E5F6',
            scene: 'i=A1B2C3D4E5F6',
            status: 'PENDING',
            attempt_count: 1,
          }),
        ],
      })

      await setLabel(
        repository,
        createLabel('item-1', {
          public_code: '0123456789AB',
          scene: 'i=0123456789AB',
          status: 'READY',
          attempt_count: 2,
          file_id: 'cloud://label-1.png',
        }),
      )

      await expect(getLabelByItemId(repository, 'item-1')).resolves.toMatchObject(
        {
          _id: 'item-label-item-1',
          public_code: '0123456789AB',
          status: 'READY',
          attempt_count: 2,
          file_id: 'cloud://label-1.png',
        },
      )
      await expect(
        getLabelByPublicCode(repository, 'A1B2C3D4E5F6'),
      ).resolves.toBeNull()
      await expect(
        getLabelByPublicCode(repository, '0123456789AB'),
      ).resolves.toMatchObject({ item_id: 'item-1' })
    })

    it('写入标签时整体替换记录而不是与旧值合并', async () => {
      const repository = await harness.create({
        labels: [
          createLabel('item-1', {
            public_code: 'A1B2C3D4E5F6',
            status: 'READY',
            file_id: 'cloud://label-1.png',
            generation_token: 'token-1',
            error_code: 'LABEL_GENERATE_FAILED',
            error_message: '生成失败',
          }),
        ],
      })

      await setLabel(repository, createBareLabel('item-1', 'A1B2C3D4E5F6'))

      const record = await getLabelByItemId(repository, 'item-1')
      expect(record).toMatchObject({ status: 'PENDING', attempt_count: 0 })
      expect(record?.file_id ?? null).toBeNull()
      expect(record?.generation_token ?? null).toBeNull()
      expect(record?.error_code ?? null).toBeNull()
      expect(record?.error_message ?? null).toBeNull()
    })

    it('缺省可选字段的标签往返后仍视为未设置', async () => {
      const repository = await harness.create({
        items: [createItem('item-1')],
      })

      await setLabel(repository, createBareLabel('item-1', 'A1B2C3D4E5F6'))

      const record = await getLabelByItemId(repository, 'item-1')
      expect(record).toMatchObject({
        _id: 'item-label-item-1',
        item_id: 'item-1',
        public_code: 'A1B2C3D4E5F6',
        page: 'pages/item-detail/index',
        scene: 'i=A1B2C3D4E5F6',
        status: 'PENDING',
        attempt_count: 0,
      })
      expect(record?.file_id ?? null).toBeNull()
      expect(record?.generation_token ?? null).toBeNull()
      expect(record?.status_before_void ?? null).toBeNull()
      expect(record?.error_code ?? null).toBeNull()

      const byCode = await getLabelByPublicCode(repository, 'A1B2C3D4E5F6')
      expect(byCode?.file_id ?? null).toBeNull()
      expect(byCode?.generation_token ?? null).toBeNull()
      expect(byCode?.status_before_void ?? null).toBeNull()
      expect(byCode?.error_code ?? null).toBeNull()
    })

    it('带可选字段的标签往返后保留原值', async () => {
      const repository = await harness.create({
        items: [createItem('item-1')],
      })

      await setLabel(
        repository,
        createLabel('item-1', {
          status: 'VOID',
          status_before_void: 'READY',
          file_id: 'cloud://label-1.png',
          generation_token: 'token-1',
          error_code: 'LABEL_GENERATE_FAILED',
          error_message: '生成失败',
          generated_at: '2026-07-30T01:00:00.000Z',
        }),
      )

      await expect(getLabelByItemId(repository, 'item-1')).resolves.toMatchObject(
        {
          status: 'VOID',
          status_before_void: 'READY',
          file_id: 'cloud://label-1.png',
          generation_token: 'token-1',
          error_code: 'LABEL_GENERATE_FAILED',
          error_message: '生成失败',
          generated_at: '2026-07-30T01:00:00.000Z',
        },
      )
    })

    it('事务提交后写入可见', async () => {
      const repository = await harness.create({
        labels: [createLabel('item-1', { status: 'PENDING', attempt_count: 1 })],
      })

      await repository.runTransaction(async (unitOfWork) => {
        const label = await unitOfWork.getLabelByItemId('item-1')
        await unitOfWork.setLabel({
          ...label!,
          status: 'READY',
          file_id: 'cloud://label-1.png',
        })
      })

      await expect(getLabelByItemId(repository, 'item-1')).resolves.toMatchObject(
        { status: 'READY', file_id: 'cloud://label-1.png' },
      )
    })

    it('事务抛出异常时全部写入回滚', async () => {
      const repository = await harness.create({
        labels: [createLabel('item-1', { status: 'PENDING', attempt_count: 1 })],
      })

      await expect(
        repository.runTransaction(async (unitOfWork) => {
          const label = await unitOfWork.getLabelByItemId('item-1')
          await unitOfWork.setLabel({ ...label!, status: 'FAILED' })
          await unitOfWork.setLabel(createBareLabel('item-2', '0123456789AB'))
          throw new Error('模拟事务失败')
        }),
      ).rejects.toThrow('模拟事务失败')

      await expect(getLabelByItemId(repository, 'item-1')).resolves.toMatchObject(
        { status: 'PENDING' },
      )
      await expect(getLabelByItemId(repository, 'item-2')).resolves.toBeNull()
      await expect(
        getLabelByPublicCode(repository, '0123456789AB'),
      ).resolves.toBeNull()
    })

    it('事务内可读到本事务尚未提交的写入', async () => {
      const repository = await harness.create({
        labels: [
          createLabel('item-1', {
            public_code: 'A1B2C3D4E5F6',
            status: 'PENDING',
            attempt_count: 1,
          }),
        ],
      })

      const seen = await repository.runTransaction(async (unitOfWork) => {
        const label = await unitOfWork.getLabelByItemId('item-1')
        await unitOfWork.setLabel({
          ...label!,
          public_code: '0123456789AB',
          scene: 'i=0123456789AB',
          status: 'READY',
          attempt_count: 2,
        })
        return {
          byItemId: await unitOfWork.getLabelByItemId('item-1'),
          byNewCode: await unitOfWork.getLabelByPublicCode('0123456789AB'),
          byOldCode: await unitOfWork.getLabelByPublicCode('A1B2C3D4E5F6'),
        }
      })

      expect(seen.byItemId).toMatchObject({ status: 'READY', attempt_count: 2 })
      expect(seen.byNewCode).toMatchObject({ item_id: 'item-1' })
      expect(seen.byOldCode).toBeNull()
    })
  })
}
