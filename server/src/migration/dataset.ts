import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { CategoryRecord } from '../../../cloudfunctions/api/src/categories/types'
import type {
  ItemOperationLogRecord,
  ItemRecord,
} from '../../../cloudfunctions/api/src/items/types'
import type { ItemLabelRecord } from '../../../cloudfunctions/api/src/labels/types'
import type {
  JoinRequestRecord,
  UserRecord,
} from '../../../cloudfunctions/api/src/membership/types'
import type { OutboundRequestRecord } from '../../../cloudfunctions/api/src/outbound/types'

export const collectionNames = [
  'users',
  'join_requests',
  'categories',
  'items',
  'item_labels',
  'item_operation_logs',
  'outbound_requests',
] as const

export type CollectionName = (typeof collectionNames)[number]

export type RawDataset = Record<CollectionName, unknown[]>

export interface MigrationDataset {
  users: UserRecord[]
  join_requests: JoinRequestRecord[]
  categories: CategoryRecord[]
  items: ItemRecord[]
  item_labels: ItemLabelRecord[]
  item_operation_logs: ItemOperationLogRecord[]
  outbound_requests: OutboundRequestRecord[]
}

export interface MigrationProblem {
  collection: CollectionName
  id: string
  reason: string
}

export function emptyRawDataset(): RawDataset {
  return {
    users: [],
    join_requests: [],
    categories: [],
    items: [],
    item_labels: [],
    item_operation_logs: [],
    outbound_requests: [],
  }
}

export function emptyDataset(): MigrationDataset {
  return {
    users: [],
    join_requests: [],
    categories: [],
    items: [],
    item_labels: [],
    item_operation_logs: [],
    outbound_requests: [],
  }
}

export function parseJsonLines(content: string, source = ''): unknown[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as unknown
      } catch {
        throw new Error(`${source}第 ${index + 1} 行不是合法的 JSON`)
      }
    })
}

export async function readRawDataset(directory: string): Promise<RawDataset> {
  const dataset = emptyRawDataset()
  for (const name of collectionNames) {
    const path = join(directory, `${name}.jsonl`)
    let content: string
    try {
      content = await readFile(path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue
      }
      throw error
    }
    dataset[name] = parseJsonLines(content, `${path} `)
  }
  return dataset
}

export function countDataset(
  dataset: MigrationDataset,
): Record<CollectionName, number> {
  return {
    users: dataset.users.length,
    join_requests: dataset.join_requests.length,
    categories: dataset.categories.length,
    items: dataset.items.length,
    item_labels: dataset.item_labels.length,
    item_operation_logs: dataset.item_operation_logs.length,
    outbound_requests: dataset.outbound_requests.length,
  }
}
