import { createHash, randomBytes, randomUUID } from 'node:crypto'

import type { Pool } from 'pg'

export interface IssuedSession {
  readonly token: string
  readonly expiresAt: string
}

export interface SessionIdentity {
  readonly userId: string
  readonly openid: string
}

export interface SessionStore {
  issue(userId: string): Promise<IssuedSession>
  verify(token: string): Promise<SessionIdentity | null>
  revokeUser(userId: string): Promise<void>
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export class PostgresSessionStore implements SessionStore {
  constructor(
    private readonly pool: Pool,
    private readonly ttlMilliseconds: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async issue(userId: string): Promise<IssuedSession> {
    const token = randomBytes(32).toString('base64url')
    const createdAt = this.now()
    const expiresAt = new Date(createdAt.getTime() + this.ttlMilliseconds)
    await this.pool.query('DELETE FROM sessions WHERE expires_at <= $1', [
      createdAt,
    ])
    await this.pool.query(
      `INSERT INTO sessions (id, token_hash, user_id, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), hashSessionToken(token), userId, createdAt, expiresAt],
    )
    return { token, expiresAt: expiresAt.toISOString() }
  }

  async verify(token: string): Promise<SessionIdentity | null> {
    const result = await this.pool.query<{ user_id: string; openid: string }>(
      `SELECT sessions.user_id, users.openid
         FROM sessions
         JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = $1 AND sessions.expires_at > $2`,
      [hashSessionToken(token), this.now()],
    )
    const row = result.rows[0]
    return row ? { userId: row.user_id, openid: row.openid } : null
  }

  async revokeUser(userId: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE user_id = $1', [userId])
  }
}
