import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'

import { ApiException } from '../../cloudfunctions/api/src/errors'
import type { ApiResponse } from '../../cloudfunctions/api/src/types'
import { startServer } from '../../server/src/app'
import type { StartedServer } from '../../server/src/app'
import type { WeChatAuthClient } from '../../server/src/auth/wechat'
import {
  closeTestPool,
  describePostgres,
  getTestPool,
  truncateAll,
} from '../contracts/postgres-support'

const bootstrapToken = 'bootstrap-token-for-test'

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const wechat: WeChatAuthClient = {
  codeToOpenid: async (code) => {
    if (!code.startsWith('code-')) {
      throw new ApiException('INVALID_LOGIN_CODE', '微信登录凭证无效或已过期')
    }
    return `openid-${code.slice('code-'.length)}`
  },
}

describePostgres('自建后端的 HTTP 接口', () => {
  let started: StartedServer
  let baseUrl: string
  let ownerToken: string

  function localise(signedUrl: string): string {
    const url = new URL(signedUrl)
    url.protocol = 'http:'
    url.host = `127.0.0.1:${started.port}`
    return url.toString()
  }

  async function signIn(code: string): Promise<{
    status: number
    body: ApiResponse
  }> {
    const response = await fetch(`${baseUrl}/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    return {
      status: response.status,
      body: (await response.json()) as ApiResponse,
    }
  }

  async function call(
    module: string,
    action: string,
    payload: unknown = {},
    token: string | null = ownerToken,
  ): Promise<{ status: number; body: ApiResponse }> {
    const response = await fetch(`${baseUrl}/api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ module, action, payload }),
    })
    return {
      status: response.status,
      body: (await response.json()) as ApiResponse,
    }
  }

  function expectData<T>(body: ApiResponse): T {
    if (!body.ok) {
      throw new Error(`接口返回错误 ${body.error.code}: ${body.error.message}`)
    }
    return body.data as T
  }

  beforeAll(async () => {
    await getTestPool()
    process.env['OWNER_BOOTSTRAP_TOKEN'] = bootstrapToken
    started = await startServer(
      {
        port: 0,
        databaseUrl: process.env['TEST_DATABASE_URL'] as string,
        databasePoolMax: 4,
        runMigrations: true,
        sessionTtlDays: 30,
        wechatAppId: 'wxtest',
        wechatAppSecret: 'unused',
        publicBaseUrl: 'https://files.test',
        storageRoot: await mkdtemp(join(tmpdir(), 'sthmoving-files-')),
        fileSigningSecret: 'file-signing-secret-for-automated-tests',
        fileUrlTtlSeconds: 600,
        uploadUrlTtlSeconds: 300,
        miniProgramEnvironment: 'release',
      },
      {
        wechat,
        external: { miniProgramCode: { generate: async () => onePixelPng } },
      },
    )
    baseUrl = `http://127.0.0.1:${started.port}`
  })

  beforeEach(async () => {
    await truncateAll(await getTestPool())
    ownerToken = expectData<{ token: string }>((await signIn('code-owner')).body)
      .token
    await call('auth', 'bootstrapOwner', { token: bootstrapToken })
  })

  afterAll(async () => {
    delete process.env['OWNER_BOOTSTRAP_TOKEN']
    await started.close()
    await closeTestPool()
  })

  it('健康检查连通数据库', async () => {
    const response = await fetch(`${baseUrl}/health`)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { status: 'ok' },
    })
  })

  it('登录换取访问令牌并建立待审成员', async () => {
    const { body } = await signIn('code-newcomer')
    const data = expectData<{
      token: string
      expiresAt: string
      session: { user: { status: string }; accessState: string }
    }>(body)
    expect(data.token.length).toBeGreaterThan(20)
    expect(Date.parse(data.expiresAt)).toBeGreaterThan(Date.now())
    expect(data.session.user.status).toBe('PENDING')
    expect(data.session.accessState).toBe('UNAPPLIED')
  })

  it('失效的微信凭证返回业务错误码', async () => {
    const { body } = await signIn('bad-code')
    expect(body).toMatchObject({
      ok: false,
      error: { code: 'INVALID_LOGIN_CODE' },
    })
  })

  it('缺少令牌的请求返回 401', async () => {
    const { status, body } = await call('system', 'ping', {}, null)
    expect(status).toBe(401)
    expect(body).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } })
  })

  it('伪造的令牌返回 401', async () => {
    const { status } = await call('system', 'ping', {}, 'not-a-real-token')
    expect(status).toBe(401)
  })

  it('未实现的接口返回 404', async () => {
    const { status, body } = await call('notifications', 'create')
    expect(status).toBe(404)
    expect(body).toMatchObject({ error: { code: 'NOT_IMPLEMENTED' } })
  })

  it('非法 JSON 返回 400', async () => {
    const response = await fetch(`${baseUrl}/api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: '{',
    })
    expect(response.status).toBe(400)
  })

  it('初始化后的账号具备所有者权限', async () => {
    const { body } = await call('auth', 'login')
    expect(expectData<{ user: { role: string } }>(body).user.role).toBe('OWNER')
  })

  it('走完登记与查询的完整链路', async () => {
    const created = await call('categories', 'create', { name: '活动器材' })
    const category = expectData<{ id: string; name: string }>(created.body)
    expect(category.name).toBe('活动器材')

    const item = await call('items', 'create', {
      name: '折叠桌',
      images: [],
      description: '两张长桌',
      quantityMode: 'MULTIPLE',
      quantity: 2,
      categoryId: category.id,
      commitSummary: '首次登记物品',
    })
    const createdItem = expectData<{ id: string; code: string }>(item.body)
    expect(createdItem.code).toMatch(/^[0-9A-F]{12}$/)

    const listed = await call('items', 'list', {})
    const list = expectData<{ items: { id: string; name: string }[] }>(
      listed.body,
    )
    expect(list.items.map((entry) => entry.name)).toContain('折叠桌')

    const detail = await call('items', 'detail', { itemId: createdItem.id })
    const loaded = expectData<{ quantity: number; category: { id: string } }>(
      detail.body,
    )
    expect(loaded.quantity).toBe(2)
    expect(loaded.category.id).toBe(category.id)

    const logs = await call('items', 'logs', { itemId: createdItem.id })
    expect(expectData<{ action: string }[]>(logs.body)).toHaveLength(1)
  })

  it('重名分类返回业务错误码', async () => {
    await call('categories', 'create', { name: '活动器材' })

    const { status, body } = await call('categories', 'create', {
      name: '活动器材',
    })
    expect(status).toBe(200)
    expect(body).toMatchObject({
      ok: false,
      error: { code: 'CATEGORY_NAME_EXISTS' },
    })
  })

  it('重复初始化所有者被拒绝', async () => {
    const { body } = await call('auth', 'bootstrapOwner', {
      token: bootstrapToken,
    })
    expect(body).toMatchObject({
      ok: false,
      error: { code: 'OWNER_BOOTSTRAP_CLOSED' },
    })
  })

  it('拒绝错误的所有者初始化口令', async () => {
    const { body } = await call('auth', 'bootstrapOwner', { token: '错误口令' })
    expect(body).toMatchObject({
      ok: false,
      error: { code: 'INVALID_BOOTSTRAP_TOKEN' },
    })
  })

  async function requestUpload(
    token: string | null = ownerToken,
  ): Promise<{ status: number; body: ApiResponse }> {
    const response = await fetch(`${baseUrl}/files/uploads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ purpose: 'ITEM_IMAGE', contentType: 'image/png' }),
    })
    return {
      status: response.status,
      body: (await response.json()) as ApiResponse,
    }
  }

  it('两段式上传后凭签名地址取回文件', async () => {
    const upload = expectData<{ reference: string; uploadUrl: string }>(
      (await requestUpload()).body,
    )
    expect(upload.reference.startsWith('file://items/')).toBe(true)

    const put = await fetch(localise(upload.uploadUrl), {
      method: 'PUT',
      body: onePixelPng,
    })
    expect(put.status).toBe(200)

    const detail = await call('items', 'create', {
      name: '折叠桌',
      images: [upload.reference],
      description: '',
      quantityMode: 'SINGLE',
      quantity: 1,
      newCategoryName: '活动器材',
      commitSummary: '首次登记物品',
    })
    const itemId = expectData<{ id: string }>(detail.body).id
    const loaded = expectData<{ images: string[] }>(
      (await call('items', 'detail', { itemId })).body,
    )
    const imageUrl = loaded.images[0] as string
    expect(imageUrl).toContain('signature=')

    const download = await fetch(localise(imageUrl))
    expect(download.status).toBe(200)
    expect(download.headers.get('content-type')).toBe('image/png')
    expect(download.headers.get('x-content-type-options')).toBe('nosniff')
    expect(Buffer.from(await download.arrayBuffer())).toEqual(onePixelPng)
  })

  it('未签名的文件地址被拒绝', async () => {
    const upload = expectData<{ reference: string; uploadUrl: string }>(
      (await requestUpload()).body,
    )
    await fetch(localise(upload.uploadUrl), { method: 'PUT', body: onePixelPng })

    const path = upload.reference.slice('file://'.length)
    const response = await fetch(`${baseUrl}/files/${path}`)
    expect(response.status).toBe(403)
  })

  it('被篡改的签名被拒绝', async () => {
    const upload = expectData<{ reference: string; uploadUrl: string }>(
      (await requestUpload()).body,
    )
    await fetch(localise(upload.uploadUrl), { method: 'PUT', body: onePixelPng })

    const forged = new URL(
      `${baseUrl}/files/${upload.reference.slice('file://'.length)}`,
    )
    forged.searchParams.set('mode', 'download')
    forged.searchParams.set(
      'expires',
      String(Math.floor(Date.now() / 1000) + 600),
    )
    forged.searchParams.set('signature', 'f'.repeat(64))

    expect((await fetch(forged)).status).toBe(403)
  })

  it('下载签名不能用于覆盖文件', async () => {
    const upload = expectData<{ reference: string; uploadUrl: string }>(
      (await requestUpload()).body,
    )
    await fetch(localise(upload.uploadUrl), { method: 'PUT', body: onePixelPng })

    const download = new URL(
      localise(
        await (async () => {
          const item = await call('items', 'create', {
            name: '折叠桌',
            images: [upload.reference],
            description: '',
            quantityMode: 'SINGLE',
            quantity: 1,
            newCategoryName: '活动器材',
            commitSummary: '首次登记物品',
          })
          const itemId = expectData<{ id: string }>(item.body).id
          const detail = await call('items', 'detail', { itemId })
          return expectData<{ images: string[] }>(detail.body).images[0] as string
        })(),
      ),
    )

    const overwrite = await fetch(download, {
      method: 'PUT',
      body: Buffer.from('覆盖内容', 'utf8'),
    })
    expect(overwrite.status).toBe(403)
  })

  it('拒绝非图片内容', async () => {
    const upload = expectData<{ uploadUrl: string }>(
      (await requestUpload()).body,
    )
    const response = await fetch(localise(upload.uploadUrl), {
      method: 'PUT',
      body: Buffer.from('<svg onload=alert(1)>', 'utf8'),
    })
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    })
  })

  it('未登录不能申请上传', async () => {
    const { status } = await requestUpload(null)
    expect(status).toBe(401)
  })

  it('解析与丢弃自己的文件', async () => {
    const upload = expectData<{ reference: string; uploadUrl: string }>(
      (await requestUpload()).body,
    )
    await fetch(localise(upload.uploadUrl), { method: 'PUT', body: onePixelPng })

    const urls = expectData<Record<string, string>>(
      (await call('storage', 'resolve', { fileIds: [upload.reference] })).body,
    )
    const signed = urls[upload.reference] as string
    expect(signed).toContain('signature=')
    expect((await fetch(localise(signed))).status).toBe(200)

    const discarded = expectData<{ discarded: number }>(
      (await call('storage', 'discard', { fileIds: [upload.reference] })).body,
    )
    expect(discarded.discarded).toBe(1)
    expect((await fetch(localise(signed))).status).toBe(404)
  })

  it('不能丢弃他人的文件', async () => {
    const upload = expectData<{ reference: string; uploadUrl: string }>(
      (await requestUpload()).body,
    )
    await fetch(localise(upload.uploadUrl), { method: 'PUT', body: onePixelPng })

    const other = expectData<{ token: string }>(
      (await signIn('code-outsider')).body,
    ).token
    const { body } = await call(
      'storage',
      'discard',
      { fileIds: [upload.reference] },
      other,
    )
    expect(body).toMatchObject({ ok: false })

    const urls = expectData<Record<string, string>>(
      (await call('storage', 'resolve', { fileIds: [upload.reference] })).body,
    )
    expect((await fetch(localise(urls[upload.reference] as string))).status).toBe(
      200,
    )
  })

  it('生成小程序码后凭签名地址取回标签图片', async () => {
    const item = await call('items', 'create', {
      name: '折叠桌',
      images: [],
      description: '',
      quantityMode: 'SINGLE',
      quantity: 1,
      newCategoryName: '活动器材',
      commitSummary: '首次登记物品',
    })
    const itemId = expectData<{ id: string }>(item.body).id

    const generated = await call('labels', 'generateMiniProgramCode', { itemId })
    const label = expectData<{ status: string; fileUrl: string }>(generated.body)
    expect(label.status).toBe('READY')
    expect(label.fileUrl).toContain('/files/labels/')
    expect(label.fileUrl).toContain('signature=')

    const download = await fetch(localise(label.fileUrl))
    expect(download.status).toBe(200)
    expect(Buffer.from(await download.arrayBuffer())).toEqual(onePixelPng)
  })

  it('权限不足的成员不能创建分类', async () => {
    const memberToken = expectData<{ token: string }>(
      (await signIn('code-member')).body,
    ).token

    const { body } = await call(
      'categories',
      'create',
      { name: '活动器材' },
      memberToken,
    )
    expect(body).toMatchObject({ ok: false })
  })
})
