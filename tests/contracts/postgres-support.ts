import { describe } from 'vitest'
import type { Pool } from 'pg'

import { migrate } from '../../server/src/db/migrate'
import { createPool } from '../../server/src/db/pool'

const connectionString = process.env['TEST_DATABASE_URL']

export const describePostgres = connectionString ? describe : describe.skip

const tables = [
  'sessions',
  'files',
  'item_operation_logs',
  'outbound_requests',
  'item_labels',
  'items',
  'join_requests',
  'categories',
  'users',
]

let sharedPool: Pool | undefined
let migrated = false

export async function getTestPool(): Promise<Pool> {
  if (!connectionString) {
    throw new Error('TEST_DATABASE_URL 未配置')
  }
  if (!sharedPool) {
    sharedPool = createPool({ connectionString })
  }
  if (!migrated) {
    await migrate(sharedPool)
    migrated = true
  }
  return sharedPool
}

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`)
}

export async function closeTestPool(): Promise<void> {
  if (sharedPool) {
    await sharedPool.end()
    sharedPool = undefined
    migrated = false
  }
}
