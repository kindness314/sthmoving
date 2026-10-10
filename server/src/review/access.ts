import { randomUUID } from 'node:crypto'

import type { Pool } from 'pg'

import { withTransaction } from '../db/pool'
import { generateTestPassword } from './passwords'

export interface ActiveTestAccess {
  readonly id: string
  readonly createdBy: string | null
  readonly createdAt: string
  readonly expiresAt: string
  readonly useCount: number
  readonly lastUsedAt: string | null
  readonly passwordHash: string
  readonly passwordSalt: string
}

interface TestAccessRow {
  id: string
  created_by: string | null
  created_at: Date
  expires_at: Date
  use_count: number
  last_used_at: Date | null
  password_hash: string
  password_salt: string
}

export interface TestAccessControl {
  active(): Promise<ActiveTestAccess | null>
  enable(
    createdBy: string,
    ttlMilliseconds: number,
  ): Promise<{ password: string; expiresAt: string }>
  disable(): Promise<void>
  recordUse(id: string): Promise<void>
}

/** 控制面存储：只读写生产库的 test_access 表。 */
export class TestAccessStore implements TestAccessControl {
  constructor(
    private readonly pool: Pool,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async active(): Promise<ActiveTestAccess | null> {
    const result = await this.pool.query<TestAccessRow>(
      `SELECT id, created_by, created_at, expires_at, use_count, last_used_at,
              password_hash, password_salt
         FROM test_access
        WHERE revoked_at IS NULL AND expires_at > $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [this.now()],
    )
    const row = result.rows[0]
    if (!row) {
      return null
    }
    return {
      id: row.id,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      useCount: row.use_count,
      lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null,
      passwordHash: row.password_hash,
      passwordSalt: row.password_salt,
    }
  }

  /** 生成新口令：旧的未失效口令一并作废。 */
  async enable(
    createdBy: string,
    ttlMilliseconds: number,
  ): Promise<{ password: string; expiresAt: string }> {
    const generated = generateTestPassword()
    const createdAt = this.now()
    const expiresAt = new Date(createdAt.getTime() + ttlMilliseconds)
    await withTransaction(this.pool, async (client) => {
      await client.query(
        'UPDATE test_access SET revoked_at = $1 WHERE revoked_at IS NULL',
        [createdAt],
      )
      await client.query(
        `INSERT INTO test_access
           (id, password_hash, password_salt, created_by,
            created_at, expires_at, use_count)
         VALUES ($1, $2, $3, $4, $5, $6, 0)`,
        [
          randomUUID(),
          generated.hash,
          generated.salt,
          createdBy,
          createdAt,
          expiresAt,
        ],
      )
    })
    return { password: generated.plaintext, expiresAt: expiresAt.toISOString() }
  }

  /** 关闭入口：所有未失效口令立即作废。 */
  async disable(): Promise<void> {
    await this.pool.query(
      'UPDATE test_access SET revoked_at = $1 WHERE revoked_at IS NULL',
      [this.now()],
    )
  }

  async recordUse(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE test_access
          SET use_count = use_count + 1, last_used_at = $2
        WHERE id = $1`,
      [id, this.now()],
    )
  }
}
