import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterAll, beforeEach, expect, it } from 'vitest'
import type { Pool } from 'pg'

import { deriveUserId } from '../../cloudfunctions/api/src/identity'
import { checkDataset } from '../../server/src/migration/check'
import type {
  MigrationDataset,
  RawDataset,
} from '../../server/src/migration/dataset'
import { emptyRawDataset } from '../../server/src/migration/dataset'
import {
  applyFileRewrites,
  findMissingFiles,
  planFileMigration,
  registerMigratedFiles,
} from '../../server/src/migration/files'
import {
  countTables,
  importDataset,
  verifyImport,
} from '../../server/src/migration/import'
import {
  closeTestPool,
  describePostgres,
  getTestPool,
  truncateAll,
} from '../contracts/postgres-support'

const ownerId = deriveUserId('openid-owner')
const memberId = deriveUserId('openid-member')
const now = '2026-07-30T00:00:00.000Z'

function rawDataset(): RawDataset {
  return {
    ...emptyRawDataset(),
    users: [
      {
        _id: ownerId,
        openid: 'openid-owner',
        display_name: '所有者',
        avatar_url: 'cloud://env.abc/avatars/x/1.png',
        role: 'OWNER',
        status: 'APPROVED',
        created_at: now,
        updated_at: now,
      },
      {
        _id: memberId,
        openid: 'openid-member',
        display_name: '成员',
        role: 'MEMBER',
        status: 'APPROVED',
        created_at: now,
        updated_at: now,
      },
    ],
    join_requests: [
      {
        _id: 'join-1',
        applicant_id: memberId,
        display_name: '成员',
        requested_role: 'MEMBER',
        status: 'PENDING',
        created_at: now,
        updated_at: now,
      },
    ],
    categories: [
      {
        _id: 'category-1',
        name: '活动器材',
        normalized_name: '活动器材',
        status: 'ACTIVE',
        is_preset: true,
        sort_order: 100,
        created_at: now,
        updated_at: now,
      },
    ],
    items: [
      {
        _id: 'item-1',
        code: 'A1B2C3D4E5F6',
        name: '折叠桌',
        images: ['cloud://env.abc/items/1-a-0.jpg'],
        description: '两张长桌',
        quantity_mode: 'MULTIPLE',
        quantity: 2,
        category_id: 'category-1',
        status: 'ACTIVE',
        version: 1,
        registered_by: ownerId,
        registered_at: now,
        updated_by: ownerId,
        updated_at: now,
      },
    ],
    item_labels: [
      {
        _id: 'item-label-item-1',
        item_id: 'item-1',
        public_code: 'A1B2C3D4E5F6',
        page: 'pages/item-detail/index',
        scene: 'i=A1B2C3D4E5F6',
        file_id: 'cloud://env.abc/labels/item-1/A1B2C3D4E5F6.png',
        status: 'READY',
        attempt_count: 1,
        created_at: now,
        updated_at: now,
      },
    ],
    item_operation_logs: [
      {
        _id: 'log-1',
        item_id: 'item-1',
        operator_id: ownerId,
        action_type: 'CREATE',
        commit_summary: '首次登记',
        version_before: 0,
        version_after: 1,
        created_at: now,
      },
    ],
    outbound_requests: [
      {
        _id: 'outbound-1',
        item_id: 'item-1',
        applicant_id: memberId,
        reason: '活动使用',
        status: 'PENDING',
        created_at: now,
        updated_at: now,
      },
    ],
  }
}

function prepared(): MigrationDataset {
  const { dataset, problems } = checkDataset(rawDataset())
  expect(problems).toEqual([])
  return applyFileRewrites(dataset, planFileMigration(dataset).rewrites)
}

describePostgres('迁移导入', () => {
  let pool: Pool

  beforeEach(async () => {
    pool = await getTestPool()
    await truncateAll(pool)
  })

  afterAll(async () => {
    await closeTestPool()
  })

  it('导入后各表数量与导出一致', async () => {
    const dataset = prepared()
    await importDataset(pool, dataset)

    await expect(verifyImport(pool, dataset)).resolves.toEqual([])
    await expect(countTables(pool)).resolves.toMatchObject({
      users: 2,
      categories: 1,
      items: 1,
      item_labels: 1,
      item_operation_logs: 1,
      join_requests: 1,
      outbound_requests: 1,
    })
  })

  it('重复导入不会产生重复数据', async () => {
    const dataset = prepared()
    await importDataset(pool, dataset)
    await importDataset(pool, dataset)

    await expect(verifyImport(pool, dataset)).resolves.toEqual([])
  })

  it('文件引用在入库时已重写为自建格式', async () => {
    await importDataset(pool, prepared())

    const item = await pool.query<{ images: string[] }>(
      'SELECT images FROM items WHERE id = $1',
      ['item-1'],
    )
    expect(item.rows[0]?.images[0]).toMatch(/^file:\/\/items\//)

    const label = await pool.query<{ file_id: string }>(
      'SELECT file_id FROM item_labels WHERE id = $1',
      ['item-label-item-1'],
    )
    expect(label.rows[0]?.file_id).toBe(
      'file://labels/item-1/A1B2C3D4E5F6.png',
    )

    const user = await pool.query<{ avatar_url: string }>(
      'SELECT avatar_url FROM users WHERE id = $1',
      [ownerId],
    )
    expect(user.rows[0]?.avatar_url).toMatch(/^file:\/\/avatars\//)
  })

  it('搬迁来的文件被登记为对应的图片类型', async () => {
    const { dataset } = checkDataset(rawDataset())
    const plan = planFileMigration(dataset)
    const root = await mkdtemp(join(tmpdir(), 'sthmoving-migrated-'))
    for (const file of plan.files) {
      await mkdir(join(root, dirname(file.path)), { recursive: true })
      await writeFile(join(root, file.path), Buffer.from([1, 2, 3, 4]))
    }

    await expect(findMissingFiles(root, plan.files)).resolves.toEqual([])
    await importDataset(pool, applyFileRewrites(dataset, plan.rewrites))
    await registerMigratedFiles(pool, root, plan.files, now)

    const rows = await pool.query<{ path: string; content_type: string }>(
      'SELECT path, content_type FROM files ORDER BY path',
    )
    expect(rows.rows).toHaveLength(3)
    expect(
      rows.rows.find((row) => row.path.startsWith('labels/'))?.content_type,
    ).toBe('image/png')
    expect(
      rows.rows.find((row) => row.path.startsWith('items/'))?.content_type,
    ).toBe('image/jpeg')
  })

  it('文件尚未搬迁时能提前发现', async () => {
    const { dataset } = checkDataset(rawDataset())
    const plan = planFileMigration(dataset)
    const root = await mkdtemp(join(tmpdir(), 'sthmoving-empty-'))

    await expect(findMissingFiles(root, plan.files)).resolves.toHaveLength(3)
  })

  it('数量不符时报告差异', async () => {
    const dataset = prepared()
    await importDataset(pool, dataset)
    await pool.query('DELETE FROM item_operation_logs')

    await expect(verifyImport(pool, dataset)).resolves.toEqual([
      { collection: 'item_operation_logs', expected: 1, actual: 0 },
    ])
  })
})
