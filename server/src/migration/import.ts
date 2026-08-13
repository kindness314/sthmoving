import type { Pool } from 'pg'

import { withTransaction } from '../db/pool'
import {
  upsertCategory,
  upsertItem,
  upsertJoinRequest,
  upsertLabel,
  upsertOperationLog,
  upsertOutboundRequest,
  upsertUser,
} from '../repositories/rows'
import type { CollectionName, MigrationDataset } from './dataset'
import { collectionNames, countDataset } from './dataset'

export interface CountMismatch {
  readonly collection: CollectionName
  readonly expected: number
  readonly actual: number
}

export async function importDataset(
  pool: Pool,
  dataset: MigrationDataset,
): Promise<void> {
  await withTransaction(pool, async (client) => {
    for (const user of dataset.users) {
      await upsertUser(client, user)
    }
    for (const category of dataset.categories) {
      await upsertCategory(client, category)
    }
    for (const item of dataset.items) {
      await upsertItem(client, item)
    }
    for (const label of dataset.item_labels) {
      await upsertLabel(client, label)
    }
    for (const log of dataset.item_operation_logs) {
      await upsertOperationLog(client, log)
    }
    for (const request of dataset.join_requests) {
      await upsertJoinRequest(client, request)
    }
    for (const request of dataset.outbound_requests) {
      await upsertOutboundRequest(client, request)
    }
  })
}

export async function countTables(
  pool: Pool,
): Promise<Record<CollectionName, number>> {
  const counts = {} as Record<CollectionName, number>
  for (const collection of collectionNames) {
    const result = await pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM ${collection}`,
    )
    counts[collection] = Number(result.rows[0]?.total ?? '0')
  }
  return counts
}

export function compareCounts(
  expected: Record<CollectionName, number>,
  actual: Record<CollectionName, number>,
): CountMismatch[] {
  return collectionNames
    .filter((collection) => expected[collection] !== actual[collection])
    .map((collection) => ({
      collection,
      expected: expected[collection],
      actual: actual[collection],
    }))
}

export async function verifyImport(
  pool: Pool,
  dataset: MigrationDataset,
): Promise<CountMismatch[]> {
  return compareCounts(countDataset(dataset), await countTables(pool))
}
