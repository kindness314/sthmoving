import type { Pool, PoolClient } from 'pg'

import type {
  MembershipRepository,
  MembershipUnitOfWork,
} from '../../../cloudfunctions/api/src/membership/repository'
import type {
  JoinRequestRecord,
  UserRecord,
} from '../../../cloudfunctions/api/src/membership/types'
import { escapeLike } from '../db/mapping'
import { withTransaction } from '../db/pool'
import {
  joinRequestRow,
  userRow,
  upsertJoinRequest,
  upsertUser,
} from './rows'

class PostgresMembershipUnitOfWork implements MembershipUnitOfWork {
  constructor(private readonly client: PoolClient) {}

  async getUser(userId: string): Promise<UserRecord | null> {
    const result = await this.client.query(
      'SELECT * FROM users WHERE id = $1',
      [userId],
    )
    return result.rows[0] ? userRow(result.rows[0]) : null
  }

  async setUser(user: UserRecord): Promise<void> {
    await upsertUser(this.client, user)
  }

  async countOwners(): Promise<number> {
    const result = await this.client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM users WHERE role = 'OWNER'`,
    )
    return result.rows[0]?.count ?? 0
  }

  async countManagers(): Promise<number> {
    const result = await this.client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM users
       WHERE role = 'MANAGER' AND status = 'APPROVED'`,
    )
    return result.rows[0]?.count ?? 0
  }

  async findPendingJoinRequest(
    applicantId: string,
  ): Promise<JoinRequestRecord | null> {
    const result = await this.client.query(
      `SELECT * FROM join_requests
       WHERE applicant_id = $1 AND status = 'PENDING'`,
      [applicantId],
    )
    return result.rows[0] ? joinRequestRow(result.rows[0]) : null
  }

  async getJoinRequest(requestId: string): Promise<JoinRequestRecord | null> {
    const result = await this.client.query(
      'SELECT * FROM join_requests WHERE id = $1 FOR UPDATE',
      [requestId],
    )
    return result.rows[0] ? joinRequestRow(result.rows[0]) : null
  }

  async setJoinRequest(request: JoinRequestRecord): Promise<void> {
    await upsertJoinRequest(this.client, request)
  }

  async listPendingJoinRequests(limit: number): Promise<JoinRequestRecord[]> {
    const result = await this.client.query(
      `SELECT * FROM join_requests
       WHERE status = 'PENDING'
       ORDER BY created_at DESC, id DESC
       LIMIT $1`,
      [limit],
    )
    return result.rows.map(joinRequestRow)
  }

  async listUsers(limit: number): Promise<UserRecord[]> {
    const result = await this.client.query(
      `SELECT * FROM users
       ORDER BY created_at DESC, id DESC
       LIMIT $1`,
      [limit],
    )
    return result.rows.map(userRow)
  }

  async searchApprovedMembers(
    keyword: string | null,
    limit: number,
    offset: number,
  ): Promise<{ users: UserRecord[]; hasMore: boolean }> {
    const pattern = keyword ? `%${escapeLike(keyword)}%` : null
    const result = await this.client.query(
      `SELECT u.*,
              (SELECT count(*) FROM items i
                WHERE i.owner_id = u.id OR i.donor_id = u.id) AS ownership_count
       FROM users u
       WHERE u.status = 'APPROVED'
         AND ($1::text IS NULL OR u.display_name ILIKE $1 ESCAPE '\\')
       ORDER BY ownership_count DESC, u.display_name ASC, u.id ASC
       LIMIT $2 OFFSET $3`,
      [pattern, limit + 1, offset],
    )
    const hasMore = result.rows.length > limit
    return {
      users: result.rows.slice(0, limit).map(userRow),
      hasMore,
    }
  }
}

export class PostgresMembershipRepository implements MembershipRepository {
  constructor(private readonly pool: Pool) {}

  runTransaction<T>(
    operation: (unitOfWork: MembershipUnitOfWork) => Promise<T>,
  ): Promise<T> {
    return withTransaction(this.pool, (client) =>
      operation(new PostgresMembershipUnitOfWork(client)),
    )
  }
}
