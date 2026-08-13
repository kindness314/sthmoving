import { Pool } from 'pg'
import type { PoolClient } from 'pg'

import { isRetryableDatabaseError, translateDatabaseError } from './errors'

export interface DatabaseConfig {
  connectionString: string
  max?: number
}

export const maxTransactionAttempts = 3

export function createPool(config: DatabaseConfig): Pool {
  return new Pool({
    connectionString: config.connectionString,
    max: config.max ?? 10,
  })
}

export async function withClient<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    return await operation(client)
  } finally {
    client.release()
  }
}

async function runTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withClient(pool, async (client) => {
    await client.query('BEGIN')
    try {
      const result = await operation(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        console.error(rollbackError)
      }
      throw error
    }
  })
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export async function withTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
  attempts: number = maxTransactionAttempts,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await runTransaction(pool, operation)
    } catch (error) {
      if (attempt >= attempts || !isRetryableDatabaseError(error)) {
        throw translateDatabaseError(error)
      }
      await delay(attempt * 20)
    }
  }
}
