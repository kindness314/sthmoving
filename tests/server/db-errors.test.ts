import { describe, expect, it, vi } from 'vitest'

import type { Pool, PoolClient } from 'pg'

import { ApiException } from '../../cloudfunctions/api/src/errors'
import {
  isRetryableDatabaseError,
  translateDatabaseError,
} from '../../server/src/db/errors'
import { withTransaction } from '../../server/src/db/pool'

function postgresError(code: string, constraint?: string): Error {
  return Object.assign(new Error('数据库错误'), { code, constraint })
}

type FakeQuery = (sql?: unknown) => Promise<unknown>

function createFakePool(query: FakeQuery): Pool {
  const client = { query, release: () => {} } as unknown as PoolClient
  return { connect: async () => client } as unknown as Pool
}

describe('数据库错误映射', () => {
  it('把唯一约束冲突翻译为对应的业务错误码', () => {
    const translated = translateDatabaseError(
      postgresError('23505', 'categories_normalized_name_live'),
    )
    expect(translated).toBeInstanceOf(ApiException)
    expect((translated as ApiException).code).toBe('CATEGORY_NAME_EXISTS')
  })

  it('把待审离库申请冲突翻译为业务错误码', () => {
    const translated = translateDatabaseError(
      postgresError('23505', 'outbound_requests_one_pending_per_item'),
    )
    expect((translated as ApiException).code).toBe('OUTBOUND_REQUEST_PENDING')
  })

  it('把外键冲突翻译为缺失资源错误码', () => {
    const translated = translateDatabaseError(
      postgresError('23503', 'items_category_id_fkey'),
    )
    expect((translated as ApiException).code).toBe('CATEGORY_NOT_FOUND')
  })

  it('未登记的约束仍给出可读的冲突提示', () => {
    const translated = translateDatabaseError(
      postgresError('23505', 'items_code_key'),
    )
    expect((translated as ApiException).code).toBe('RESOURCE_CONFLICT')
  })

  it('把长度与检查约束翻译为参数错误', () => {
    expect(
      (translateDatabaseError(postgresError('22001')) as ApiException).code,
    ).toBe('INVALID_REQUEST')
    expect(
      (translateDatabaseError(postgresError('23514')) as ApiException).code,
    ).toBe('INVALID_REQUEST')
  })

  it('保留非数据库错误', () => {
    const original = new Error('业务错误')
    expect(translateDatabaseError(original)).toBe(original)
  })

  it('识别可重试的并发错误', () => {
    expect(isRetryableDatabaseError(postgresError('40001'))).toBe(true)
    expect(isRetryableDatabaseError(postgresError('40P01'))).toBe(true)
    expect(isRetryableDatabaseError(postgresError('23505'))).toBe(false)
    expect(isRetryableDatabaseError(new Error('普通错误'))).toBe(false)
  })
})

describe('事务重试', () => {
  it('遇到死锁后重试并最终成功', async () => {
    const query = vi.fn(async () => ({}))
    const pool = createFakePool(query)
    let attempts = 0

    const result = await withTransaction(pool, async () => {
      attempts += 1
      if (attempts < 3) {
        throw postgresError('40P01')
      }
      return '完成'
    })

    expect(result).toBe('完成')
    expect(attempts).toBe(3)
    expect(query).toHaveBeenCalledWith('ROLLBACK')
    expect(query).toHaveBeenCalledWith('COMMIT')
  })

  it('重试次数用尽后翻译错误抛出', async () => {
    const pool = createFakePool(async () => ({}))
    let attempts = 0

    await expect(
      withTransaction(pool, async () => {
        attempts += 1
        throw postgresError('40001')
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' })
    expect(attempts).toBe(3)
  })

  it('不重试唯一约束冲突', async () => {
    const pool = createFakePool(async () => ({}))
    let attempts = 0

    await expect(
      withTransaction(pool, async () => {
        attempts += 1
        throw postgresError('23505', 'users_single_owner')
      }),
    ).rejects.toMatchObject({ code: 'OWNER_BOOTSTRAP_CLOSED' })
    expect(attempts).toBe(1)
  })

  it('回滚失败时不掩盖原始错误', async () => {
    const pool = createFakePool(async (sql) => {
      if (sql === 'ROLLBACK') {
        throw new Error('回滚失败')
      }
      return {}
    })

    await expect(
      withTransaction(pool, async () => {
        throw postgresError('23503', 'item_labels_item_id_fkey')
      }),
    ).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND' })
  })
})
