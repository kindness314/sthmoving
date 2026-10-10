import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Pool } from 'pg'

import type { ApiResponse } from '../../cloudfunctions/api/src/types'
import { deriveUserId } from '../../cloudfunctions/api/src/identity'
import { startServer } from '../../server/src/app'
import type { StartedServer } from '../../server/src/app'
import { hashSessionToken } from '../../server/src/auth/sessions'
import {
  closeTestPool,
  describePostgres,
  getTestPool,
  truncateAll,
} from '../contracts/postgres-support'

const prodToken = 'prod-owner-token'
const memberToken = 'prod-member-token'
const ownerId = deriveUserId('openid-review-owner')
const memberId = deriveUserId('openid-review-member')
const sandboxSuffix = '_sandbox'
const storageSecret = 'review-test-signing-secret-0123456789'

function sandboxConnection(controlUrl: string): {
  url: string
  database: string
} {
  const parsed = new URL(controlUrl)
  const database = `${parsed.pathname.replace(/^\//, '')}${sandboxSuffix}`
  parsed.pathname = `/${database}`
  return { url: parsed.toString(), database }
}

describePostgres('审核沙箱与生产隔离', () => {
  let started: StartedServer
  let baseUrl: string
  let sandboxDatabase: string
  let controlStorage: string
  let sandboxStorage: string
  let sandboxToken = ''

  async function call(
    module: string,
    action: string,
    payload: unknown,
    token: string,
  ): Promise<{ status: number; body: ApiResponse }> {
    const response = await fetch(`${baseUrl}/api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ module, action, payload }),
    })
    return {
      status: response.status,
      body: (await response.json()) as ApiResponse,
    }
  }

  async function startTestSession(password: string): Promise<ApiResponse> {
    const response = await fetch(`${baseUrl}/auth/test-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    return (await response.json()) as ApiResponse
  }

  function expectData<T>(body: ApiResponse): T {
    if (!body.ok) {
      throw new Error(`接口返回错误 ${body.error.code}: ${body.error.message}`)
    }
    return body.data as T
  }

  beforeAll(async () => {
    const controlUrl = process.env['TEST_DATABASE_URL']
    if (!controlUrl) {
      throw new Error('TEST_DATABASE_URL 未配置')
    }
    const pool = await getTestPool()
    await truncateAll(pool)

    const sandbox = sandboxConnection(controlUrl)
    sandboxDatabase = sandbox.database
    await pool.query(`DROP DATABASE IF EXISTS "${sandboxDatabase}" WITH (FORCE)`)
    await pool.query(`CREATE DATABASE "${sandboxDatabase}"`)

    await seedUser(pool, ownerId, 'openid-review-owner', '审核所有者', 'OWNER')
    await seedUser(pool, memberId, 'openid-review-member', '普通成员', 'MEMBER')
    await seedSession(pool, prodToken, ownerId)
    await seedSession(pool, memberToken, memberId)

    controlStorage = await mkdtemp(join(tmpdir(), 'sthmoving-review-'))
    sandboxStorage = await mkdtemp(join(tmpdir(), 'sthmoving-sandbox-'))

    started = await startServer({
      port: 0,
      databaseUrl: controlUrl,
      databasePoolMax: 4,
      runMigrations: true,
      sessionTtlDays: 30,
      wechatAppId: 'wxreview',
      wechatAppSecret: 'unused',
      publicBaseUrl: 'http://127.0.0.1:1',
      storageRoot: controlStorage,
      fileSigningSecret: storageSecret,
      fileUrlTtlSeconds: 600,
      uploadUrlTtlSeconds: 300,
      miniProgramEnvironment: 'release',
      testDatabaseUrl: sandbox.url,
      testStorageRoot: sandboxStorage,
      testFileSigningSecret: `${storageSecret}-sandbox`,
      testAccessTtlHours: 168,
    })
    baseUrl = `http://127.0.0.1:${started.port}`
  })

  afterAll(async () => {
    await started?.close()
    const pool = await getTestPool()
    await pool.query(`DROP DATABASE IF EXISTS "${sandboxDatabase}" WITH (FORCE)`)
    await closeTestPool()
    await rm(controlStorage, { recursive: true, force: true })
    await rm(sandboxStorage, { recursive: true, force: true })
  })

  it('普通成员无权管理测试入口', async () => {
    const result = await call(
      'review',
      'enableTestAccess',
      {},
      memberToken,
    )
    expect(result.body).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })

  it('口令登录进入沙箱，数据与生产互不可见', async () => {
    const enabled = expectData<{ password: string }>(
      (
        await call('review', 'enableTestAccess', {}, prodToken)
      ).body,
    )
    expect(enabled.password).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/)

    const issued = expectData<{ token: string }>(
      await startTestSession(enabled.password),
    )
    expect(issued.token.startsWith('t1_')).toBe(true)
    sandboxToken = issued.token

    const sandboxMembers = expectData<{ id: string; displayName: string }[]>(
      (await call('membership', 'listMembers', {}, sandboxToken)).body,
    )
    expect(sandboxMembers.map((member) => member.displayName)).toContain(
      '审核体验',
    )
    expect(sandboxMembers.map((member) => member.id)).not.toContain(ownerId)

    const prodMembers = expectData<{ id: string }[]>(
      (await call('membership', 'listMembers', {}, prodToken)).body,
    )
    expect(prodMembers.map((member) => member.id)).toContain(ownerId)
    expect(prodMembers.map((member) => member.id)).not.toContain(
      deriveUserId('review:sandbox'),
    )
  })

  it('沙箱身份为所有者，可体验全部功能', async () => {
    const session = expectData<{ user: { role: string } }>(
      (await call('auth', 'login', {}, sandboxToken)).body,
    )
    expect(session.user.role).toBe('OWNER')
  })

  it('沙箱域内不提供测试入口管理', async () => {
    const result = await call('review', 'testAccess', {}, sandboxToken)
    expect(result.body).toMatchObject({
      ok: false,
      error: { code: 'TEST_ACCESS_UNAVAILABLE' },
    })
  })

  it('同一口令可重复使用并累计使用次数', async () => {
    const enabled = expectData<{ password: string }>(
      (await call('review', 'enableTestAccess', {}, prodToken)).body,
    )
    await startTestSession(enabled.password)
    await startTestSession(enabled.password)

    const info = expectData<{ enabled: boolean; useCount: number }>(
      (await call('review', 'testAccess', {}, prodToken)).body,
    )
    expect(info).toMatchObject({ enabled: true, useCount: 2 })
  })

  it('重新生成口令后旧口令立即失效', async () => {
    const first = expectData<{ password: string }>(
      (await call('review', 'enableTestAccess', {}, prodToken)).body,
    )
    const second = expectData<{ password: string }>(
      (await call('review', 'enableTestAccess', {}, prodToken)).body,
    )
    expect(second.password).not.toBe(first.password)
    expect(await startTestSession(first.password)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_TEST_PASSWORD' },
    })
  })

  it('关闭入口后口令失效且沙箱会话被吊销', async () => {
    await call('review', 'disableTestAccess', {}, prodToken)
    const closed = await startTestSession('ANYTHING')
    expect(closed).toMatchObject({
      ok: false,
      error: { code: 'TEST_ACCESS_CLOSED' },
    })

    const revoked = await call('membership', 'listMembers', {}, sandboxToken)
    expect(revoked.body).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    })
  })

  it('沙箱库不可用时降级，生产照常可用', async () => {
    const degraded = await startServer({
      port: 0,
      databaseUrl: process.env['TEST_DATABASE_URL'] as string,
      databasePoolMax: 2,
      runMigrations: true,
      sessionTtlDays: 30,
      wechatAppId: 'wxreview',
      wechatAppSecret: 'unused',
      publicBaseUrl: 'http://127.0.0.1:1',
      storageRoot: controlStorage,
      fileSigningSecret: storageSecret,
      fileUrlTtlSeconds: 600,
      uploadUrlTtlSeconds: 300,
      miniProgramEnvironment: 'release',
      testDatabaseUrl: 'postgres://sthmoving:wrong@postgres:5432/missing_db',
      testStorageRoot: sandboxStorage,
      testFileSigningSecret: `${storageSecret}-sandbox`,
      testAccessTtlHours: 168,
    })
    try {
      const degradedUrl = `http://127.0.0.1:${degraded.port}`
      const health = await fetch(`${degradedUrl}/health`)
      expect(health.status).toBe(200)

      const status = (await (
        await fetch(`${degradedUrl}/auth/test-access`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).json()) as ApiResponse
      expect(status).toMatchObject({ ok: true, data: { enabled: false } })
    } finally {
      await degraded.close()
    }
  })
})

async function seedUser(
  pool: Pool,
  id: string,
  openid: string,
  displayName: string,
  role: 'OWNER' | 'MEMBER',
): Promise<void> {
  const now = new Date()
  await pool.query(
    `INSERT INTO users (id, openid, display_name, role, status,
                        joined_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'APPROVED', $5, $5, $5)`,
    [id, openid, displayName, role, now],
  )
}

async function seedSession(
  pool: Pool,
  token: string,
  userId: string,
): Promise<void> {
  const now = new Date()
  await pool.query(
    `INSERT INTO sessions (id, token_hash, user_id, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      `session-${userId}`,
      hashSessionToken(token),
      userId,
      now,
      new Date(now.getTime() + 60 * 60 * 1000),
    ],
  )
}
