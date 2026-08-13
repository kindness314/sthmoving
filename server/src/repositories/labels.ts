import type { Pool, PoolClient } from 'pg'

import type { ItemRecord } from '../../../cloudfunctions/api/src/items/types'
import type {
  LabelRepository,
  LabelUnitOfWork,
} from '../../../cloudfunctions/api/src/labels/repository'
import type { ItemLabelRecord } from '../../../cloudfunctions/api/src/labels/types'
import type { UserRecord } from '../../../cloudfunctions/api/src/membership/types'
import { withTransaction } from '../db/pool'
import { itemRow, labelRow, userRow, upsertLabel } from './rows'

class PostgresLabelUnitOfWork implements LabelUnitOfWork {
  constructor(private readonly client: PoolClient) {}

  async getUser(userId: string): Promise<UserRecord | null> {
    const result = await this.client.query(
      'SELECT * FROM users WHERE id = $1',
      [userId],
    )
    return result.rows[0] ? userRow(result.rows[0]) : null
  }

  async getItem(itemId: string): Promise<ItemRecord | null> {
    const result = await this.client.query(
      `SELECT * FROM items WHERE id = $1 AND status <> 'DELETED'`,
      [itemId],
    )
    return result.rows[0] ? itemRow(result.rows[0]) : null
  }

  async getLabelByItemId(itemId: string): Promise<ItemLabelRecord | null> {
    const result = await this.client.query(
      'SELECT * FROM item_labels WHERE item_id = $1',
      [itemId],
    )
    return result.rows[0] ? labelRow(result.rows[0]) : null
  }

  async getLabelByPublicCode(
    publicCode: string,
  ): Promise<ItemLabelRecord | null> {
    const result = await this.client.query(
      'SELECT * FROM item_labels WHERE public_code = $1',
      [publicCode],
    )
    return result.rows[0] ? labelRow(result.rows[0]) : null
  }

  async setLabel(label: ItemLabelRecord): Promise<void> {
    await upsertLabel(this.client, label)
  }
}

export class PostgresLabelRepository implements LabelRepository {
  constructor(private readonly pool: Pool) {}

  runTransaction<T>(
    operation: (unitOfWork: LabelUnitOfWork) => Promise<T>,
  ): Promise<T> {
    return withTransaction(this.pool, (client) =>
      operation(new PostgresLabelUnitOfWork(client)),
    )
  }
}
