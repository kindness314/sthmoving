import { afterAll, beforeEach, expect, it } from 'vitest'
import type { Pool } from 'pg'

import { withTransaction } from '../../server/src/db/pool'
import {
  upsertCategory,
  upsertItem,
  upsertJoinRequest,
  upsertOutboundRequest,
  upsertUser,
} from '../../server/src/repositories/rows'
import {
  closeTestPool,
  describePostgres,
  getTestPool,
  truncateAll,
} from '../contracts/postgres-support'
import {
  createCategory,
  createItem,
  createJoinRequest,
  createOutboundRequest,
  createUser,
} from '../contracts/support'

describePostgres('真实数据库的错误码映射', () => {
  let pool: Pool

  beforeEach(async () => {
    pool = await getTestPool()
    await truncateAll(pool)
  })

  afterAll(async () => {
    await closeTestPool()
  })

  it('重复的分类名称映射为分类名称冲突', async () => {
    await withTransaction(pool, (client) =>
      upsertCategory(client, createCategory('category-1')),
    )

    await expect(
      withTransaction(pool, (client) =>
        upsertCategory(
          client,
          createCategory('category-2', { normalized_name: 'category-1' }),
        ),
      ),
    ).rejects.toMatchObject({ code: 'CATEGORY_NAME_EXISTS' })
  })

  it('重复的待审离库申请映射为已有待处理申请', async () => {
    await withTransaction(pool, async (client) => {
      await upsertUser(client, createUser('user-1'))
      await upsertCategory(client, createCategory('category-1'))
      await upsertItem(client, createItem('item-1'))
      await upsertOutboundRequest(
        client,
        createOutboundRequest('outbound-1', 'item-1', 'user-1'),
      )
    })

    await expect(
      withTransaction(pool, (client) =>
        upsertOutboundRequest(
          client,
          createOutboundRequest('outbound-2', 'item-1', 'user-1'),
        ),
      ),
    ).rejects.toMatchObject({ code: 'OUTBOUND_REQUEST_PENDING' })
  })

  it('重复的待审入伙申请映射为已有待审申请', async () => {
    await withTransaction(pool, async (client) => {
      await upsertUser(client, createUser('user-1'))
      await upsertJoinRequest(client, createJoinRequest('join-1', 'user-1'))
    })

    await expect(
      withTransaction(pool, (client) =>
        upsertJoinRequest(client, createJoinRequest('join-2', 'user-1')),
      ),
    ).rejects.toMatchObject({ code: 'JOIN_REQUEST_PENDING' })
  })

  it('第二位所有者映射为初始化已关闭', async () => {
    await withTransaction(pool, (client) =>
      upsertUser(client, createUser('user-1', { role: 'OWNER' })),
    )

    await expect(
      withTransaction(pool, (client) =>
        upsertUser(client, createUser('user-2', { role: 'OWNER' })),
      ),
    ).rejects.toMatchObject({ code: 'OWNER_BOOTSTRAP_CLOSED' })
  })

  it('缺失的分类外键映射为未找到分类', async () => {
    await expect(
      withTransaction(pool, async (client) => {
        await upsertUser(client, createUser('user-1'))
        await upsertItem(client, createItem('item-1', { category_id: '不存在' }))
      }),
    ).rejects.toMatchObject({ code: 'CATEGORY_NOT_FOUND' })
  })

  it('超长字段映射为参数错误', async () => {
    await expect(
      withTransaction(pool, (client) =>
        upsertUser(client, createUser('user-1', { display_name: '名'.repeat(80) })),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  })
})
