import type { Pool, PoolClient } from 'pg'

import type { CategoryRecord } from '../../../cloudfunctions/api/src/categories/types'
import type {
  ItemRepository,
  ItemUnitOfWork,
} from '../../../cloudfunctions/api/src/items/repository'
import type {
  ItemListQuery,
  ItemOperationLogRecord,
  ItemRecord,
} from '../../../cloudfunctions/api/src/items/types'
import type { ItemLabelRecord } from '../../../cloudfunctions/api/src/labels/types'
import type { UserRecord } from '../../../cloudfunctions/api/src/membership/types'
import { escapeLike } from '../db/mapping'
import { withTransaction } from '../db/pool'
import {
  categoryRow,
  itemRow,
  operationLogRow,
  userRow,
  upsertCategory,
  upsertItem,
  upsertLabel,
  upsertOperationLog,
} from './rows'

type Queryable = Pool | PoolClient

async function getUser(
  db: Queryable,
  userId: string,
): Promise<UserRecord | null> {
  const result = await db.query('SELECT * FROM users WHERE id = $1', [userId])
  return result.rows[0] ? userRow(result.rows[0]) : null
}

async function getCategory(
  db: Queryable,
  categoryId: string,
): Promise<CategoryRecord | null> {
  const result = await db.query(
    `SELECT * FROM categories WHERE id = $1 AND status <> 'DELETED'`,
    [categoryId],
  )
  return result.rows[0] ? categoryRow(result.rows[0]) : null
}

async function getCategoryByNormalizedName(
  db: Queryable,
  normalizedName: string,
): Promise<CategoryRecord | null> {
  const result = await db.query(
    `SELECT * FROM categories
     WHERE normalized_name = $1 AND status <> 'DELETED'`,
    [normalizedName],
  )
  return result.rows[0] ? categoryRow(result.rows[0]) : null
}

async function getItem(
  db: Queryable,
  itemId: string,
): Promise<ItemRecord | null> {
  const result = await db.query(
    `SELECT * FROM items WHERE id = $1 AND status <> 'DELETED'`,
    [itemId],
  )
  return result.rows[0] ? itemRow(result.rows[0]) : null
}

class PostgresItemUnitOfWork implements ItemUnitOfWork {
  constructor(private readonly client: PoolClient) {}

  getUser(userId: string): Promise<UserRecord | null> {
    return getUser(this.client, userId)
  }

  getCategory(categoryId: string): Promise<CategoryRecord | null> {
    return getCategory(this.client, categoryId)
  }

  getCategoryByNormalizedName(
    normalizedName: string,
  ): Promise<CategoryRecord | null> {
    return getCategoryByNormalizedName(this.client, normalizedName)
  }

  getItem(itemId: string): Promise<ItemRecord | null> {
    return getItem(this.client, itemId)
  }

  async setCategory(category: CategoryRecord): Promise<void> {
    await upsertCategory(this.client, category)
  }

  async setItem(item: ItemRecord): Promise<void> {
    await upsertItem(this.client, item)
  }

  async setLabel(label: ItemLabelRecord): Promise<void> {
    await upsertLabel(this.client, label)
  }

  async setOperationLog(log: ItemOperationLogRecord): Promise<void> {
    await upsertOperationLog(this.client, log)
  }
}

export class PostgresItemRepository implements ItemRepository {
  constructor(private readonly pool: Pool) {}

  getUser(userId: string): Promise<UserRecord | null> {
    return getUser(this.pool, userId)
  }

  getCategory(categoryId: string): Promise<CategoryRecord | null> {
    return getCategory(this.pool, categoryId)
  }

  async getCategoriesByIds(categoryIds: string[]): Promise<CategoryRecord[]> {
    if (categoryIds.length === 0) {
      return []
    }
    const result = await this.pool.query(
      `SELECT * FROM categories
       WHERE id = ANY($1::text[]) AND status <> 'DELETED'`,
      [[...new Set(categoryIds)]],
    )
    return result.rows.map(categoryRow)
  }

  async getUsersByIds(userIds: string[]): Promise<UserRecord[]> {
    if (userIds.length === 0) {
      return []
    }
    const result = await this.pool.query(
      'SELECT * FROM users WHERE id = ANY($1::text[])',
      [[...new Set(userIds)]],
    )
    return result.rows.map(userRow)
  }

  getItem(itemId: string): Promise<ItemRecord | null> {
    return getItem(this.pool, itemId)
  }

  async listOperationLogs(itemId: string): Promise<ItemOperationLogRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM item_operation_logs
       WHERE item_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 100`,
      [itemId],
    )
    return result.rows.map(operationLogRow)
  }

  async listItems(query: ItemListQuery): Promise<ItemRecord[]> {
    const statuses = query.status
      ? [query.status]
      : ['ACTIVE', 'OUTBOUND_PENDING']
    const pattern = query.keyword
      ? `%${escapeLike(query.keyword)}%`
      : null
    const result = await this.pool.query(
      `SELECT * FROM items
       WHERE status <> 'DELETED'
         AND status = ANY($1::text[])
         AND ($2::text IS NULL OR category_id = $2)
         AND ($3::text IS NULL
              OR name ILIKE $3 ESCAPE '\\'
              OR description ILIKE $3 ESCAPE '\\'
              OR code ILIKE $3 ESCAPE '\\')
         AND ($4::timestamptz IS NULL
              OR (updated_at, id) < ($4::timestamptz, $5::text))
       ORDER BY updated_at DESC, id DESC
       LIMIT $6`,
      [
        statuses,
        query.categoryId ?? null,
        pattern,
        query.cursor?.updatedAt ?? null,
        query.cursor?.id ?? null,
        query.limit,
      ],
    )
    return result.rows.map(itemRow)
  }

  runTransaction<T>(
    operation: (unitOfWork: ItemUnitOfWork) => Promise<T>,
  ): Promise<T> {
    return withTransaction(this.pool, (client) =>
      operation(new PostgresItemUnitOfWork(client)),
    )
  }
}
