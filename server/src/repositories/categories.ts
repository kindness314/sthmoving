import type { Pool, PoolClient } from 'pg'

import type {
  CategoryRepository,
  CategoryUnitOfWork,
} from '../../../cloudfunctions/api/src/categories/repository'
import type { CategoryRecord } from '../../../cloudfunctions/api/src/categories/types'
import type { UserRecord } from '../../../cloudfunctions/api/src/membership/types'
import { withTransaction } from '../db/pool'
import { categoryRow, userRow, upsertCategory } from './rows'

class PostgresCategoryUnitOfWork implements CategoryUnitOfWork {
  constructor(private readonly client: PoolClient) {}

  async getUser(userId: string): Promise<UserRecord | null> {
    const result = await this.client.query(
      'SELECT * FROM users WHERE id = $1',
      [userId],
    )
    return result.rows[0] ? userRow(result.rows[0]) : null
  }

  async getCategory(categoryId: string): Promise<CategoryRecord | null> {
    const result = await this.client.query(
      `SELECT * FROM categories WHERE id = $1 AND status <> 'DELETED'`,
      [categoryId],
    )
    return result.rows[0] ? categoryRow(result.rows[0]) : null
  }

  async getCategoryByNormalizedName(
    normalizedName: string,
  ): Promise<CategoryRecord | null> {
    const result = await this.client.query(
      `SELECT * FROM categories
       WHERE normalized_name = $1 AND status <> 'DELETED'`,
      [normalizedName],
    )
    return result.rows[0] ? categoryRow(result.rows[0]) : null
  }

  async hasItemReference(categoryId: string): Promise<boolean> {
    const result = await this.client.query<{ has_reference: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM items WHERE category_id = $1 AND status <> 'DELETED'
       ) AS has_reference`,
      [categoryId],
    )
    return result.rows[0]?.has_reference ?? false
  }

  async setCategory(category: CategoryRecord): Promise<void> {
    await upsertCategory(this.client, category)
  }

  async listActiveCategories(): Promise<CategoryRecord[]> {
    const result = await this.client.query(
      `SELECT * FROM categories
       WHERE status = 'ACTIVE'
       ORDER BY sort_order, id`,
    )
    return result.rows.map(categoryRow)
  }

  async listAllCategories(): Promise<CategoryRecord[]> {
    const result = await this.client.query(
      `SELECT * FROM categories
       WHERE status <> 'DELETED'
       ORDER BY sort_order, id`,
    )
    return result.rows.map(categoryRow)
  }
}

export class PostgresCategoryRepository implements CategoryRepository {
  constructor(private readonly pool: Pool) {}

  runTransaction<T>(
    operation: (unitOfWork: CategoryUnitOfWork) => Promise<T>,
  ): Promise<T> {
    return withTransaction(this.pool, (client) =>
      operation(new PostgresCategoryUnitOfWork(client)),
    )
  }
}
