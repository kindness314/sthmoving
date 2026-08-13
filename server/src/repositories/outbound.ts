import type { Pool, PoolClient } from 'pg'

import type {
  ItemOperationLogRecord,
  ItemRecord,
} from '../../../cloudfunctions/api/src/items/types'
import type { ItemLabelRecord } from '../../../cloudfunctions/api/src/labels/types'
import type { UserRecord } from '../../../cloudfunctions/api/src/membership/types'
import type {
  OutboundRepository,
  OutboundUnitOfWork,
} from '../../../cloudfunctions/api/src/outbound/repository'
import type { OutboundRequestRecord } from '../../../cloudfunctions/api/src/outbound/types'
import { withTransaction } from '../db/pool'
import {
  itemRow,
  labelRow,
  outboundRequestRow,
  userRow,
  upsertItem,
  upsertLabel,
  upsertOperationLog,
  upsertOutboundRequest,
} from './rows'

class PostgresOutboundUnitOfWork implements OutboundUnitOfWork {
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

  async getRequest(requestId: string): Promise<OutboundRequestRecord | null> {
    const result = await this.client.query(
      'SELECT * FROM outbound_requests WHERE id = $1',
      [requestId],
    )
    return result.rows[0] ? outboundRequestRow(result.rows[0]) : null
  }

  async findPendingRequest(
    itemId: string,
  ): Promise<OutboundRequestRecord | null> {
    const result = await this.client.query(
      `SELECT * FROM outbound_requests
       WHERE item_id = $1 AND status = 'PENDING'`,
      [itemId],
    )
    return result.rows[0] ? outboundRequestRow(result.rows[0]) : null
  }

  async listPendingRequests(limit: number): Promise<OutboundRequestRecord[]> {
    const result = await this.client.query(
      `SELECT * FROM outbound_requests
       WHERE status = 'PENDING'
       ORDER BY created_at DESC, id DESC
       LIMIT $1`,
      [limit],
    )
    return result.rows.map(outboundRequestRow)
  }

  async listRequestsByApplicant(
    applicantId: string,
    limit: number,
  ): Promise<OutboundRequestRecord[]> {
    const result = await this.client.query(
      `SELECT * FROM outbound_requests
       WHERE applicant_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [applicantId, limit],
    )
    return result.rows.map(outboundRequestRow)
  }

  async getLabelByItemId(itemId: string): Promise<ItemLabelRecord | null> {
    const result = await this.client.query(
      'SELECT * FROM item_labels WHERE item_id = $1',
      [itemId],
    )
    return result.rows[0] ? labelRow(result.rows[0]) : null
  }

  async setItem(item: ItemRecord): Promise<void> {
    await upsertItem(this.client, item)
  }

  async setRequest(request: OutboundRequestRecord): Promise<void> {
    await upsertOutboundRequest(this.client, request)
  }

  async setLabel(label: ItemLabelRecord): Promise<void> {
    await upsertLabel(this.client, label)
  }

  async setOperationLog(log: ItemOperationLogRecord): Promise<void> {
    await upsertOperationLog(this.client, log)
  }
}

export class PostgresOutboundRepository implements OutboundRepository {
  constructor(private readonly pool: Pool) {}

  runTransaction<T>(
    operation: (unitOfWork: OutboundUnitOfWork) => Promise<T>,
  ): Promise<T> {
    return withTransaction(this.pool, (client) =>
      operation(new PostgresOutboundUnitOfWork(client)),
    )
  }
}
