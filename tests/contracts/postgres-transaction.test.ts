import { afterAll, beforeEach, expect, it } from 'vitest'

import { withTransaction } from '../../server/src/db/pool'
import {
  closeTestPool,
  describePostgres,
  getTestPool,
  truncateAll,
} from './postgres-support'

const insertUser = `
  INSERT INTO users (id, openid, display_name, role, status, created_at, updated_at)
  VALUES ($1, $2, $1, 'MEMBER', 'APPROVED', $3, $3)
`
const now = '2026-07-30T00:00:00.000Z'

describePostgres('PostgreSQL 事务语义', () => {
  beforeEach(async () => {
    await truncateAll(await getTestPool())
  })

  afterAll(async () => {
    await closeTestPool()
  })

  it('事务内的全部语句在同一条连接上执行', async () => {
    const pool = await getTestPool()

    const pids = await withTransaction(pool, async (client) => {
      const collected: number[] = []
      for (let index = 0; index < 4; index += 1) {
        const result = await client.query<{ pid: number }>(
          'SELECT pg_backend_pid() AS pid',
        )
        collected.push(result.rows[0]!.pid)
      }
      return collected
    })

    expect(new Set(pids).size).toBe(1)
  })

  it('未提交的写入对其他连接不可见', async () => {
    const pool = await getTestPool()

    await withTransaction(pool, async (client) => {
      await client.query(insertUser, ['user-1', 'openid-1', now])
      const inside = await client.query('SELECT id FROM users')
      expect(inside.rowCount).toBe(1)

      const outside = await pool.query('SELECT id FROM users')
      expect(outside.rowCount).toBe(0)
    })
  })

  it('事务提交后写入对其他连接可见', async () => {
    const pool = await getTestPool()

    await withTransaction(pool, async (client) => {
      await client.query(insertUser, ['user-1', 'openid-1', now])
    })

    const result = await pool.query('SELECT id FROM users')
    expect(result.rows.map((row) => row['id'])).toEqual(['user-1'])
  })

  it('事务抛出异常后写入被回滚', async () => {
    const pool = await getTestPool()

    await expect(
      withTransaction(pool, async (client) => {
        await client.query(insertUser, ['user-1', 'openid-1', now])
        throw new Error('模拟事务失败')
      }),
    ).rejects.toThrow('模拟事务失败')

    const result = await pool.query('SELECT id FROM users')
    expect(result.rowCount).toBe(0)
  })

  it('回滚后连接可继续正常使用', async () => {
    const pool = await getTestPool()

    await expect(
      withTransaction(pool, async (client) => {
        await client.query(insertUser, ['user-1', 'openid-1', now])
        throw new Error('模拟事务失败')
      }),
    ).rejects.toThrow('模拟事务失败')

    await withTransaction(pool, async (client) => {
      await client.query(insertUser, ['user-2', 'openid-2', now])
    })

    const result = await pool.query('SELECT id FROM users')
    expect(result.rows.map((row) => row['id'])).toEqual(['user-2'])
  })

  it('唯一约束冲突会中止事务并回滚', async () => {
    const pool = await getTestPool()
    await pool.query(insertUser, ['user-1', 'openid-1', now])

    await expect(
      withTransaction(pool, async (client) => {
        await client.query(insertUser, ['user-2', 'openid-2', now])
        await client.query(insertUser, ['user-3', 'openid-1', now])
      }),
    ).rejects.toMatchObject({ code: 'IDENTITY_CONFLICT' })

    const result = await pool.query('SELECT id FROM users')
    expect(result.rows.map((row) => row['id'])).toEqual(['user-1'])
  })
})
