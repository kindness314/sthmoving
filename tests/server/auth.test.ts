import type { IncomingMessage } from 'node:http'

import { describe, expect, it, vi } from 'vitest'

import { ApiException } from '../../cloudfunctions/api/src/errors'
import { createBearerAuthenticator } from '../../server/src/auth/routes'
import { hashSessionToken } from '../../server/src/auth/sessions'
import type { SessionIdentity, SessionStore } from '../../server/src/auth/sessions'
import { HttpWeChatAuthClient } from '../../server/src/auth/wechat'

function requestWith(authorization?: string): IncomingMessage {
  return {
    headers: authorization ? { authorization } : {},
  } as unknown as IncomingMessage
}

function storeReturning(identity: SessionIdentity | null): SessionStore {
  return {
    issue: async () => ({ token: '令牌', expiresAt: '2026-09-01T00:00:00.000Z' }),
    verify: async () => identity,
    revokeUser: async () => {},
  }
}

function respondWith(body: unknown, ok = true): typeof fetch {
  return (async () => ({
    ok,
    json: async () => body,
  })) as unknown as typeof fetch
}

describe('访问令牌鉴权', () => {
  it('接受有效的 Bearer 令牌', async () => {
    const authenticate = createBearerAuthenticator(
      storeReturning({ userId: 'user-1', openid: 'openid-1' }),
    )
    await expect(
      authenticate(requestWith('Bearer 有效令牌')),
    ).resolves.toEqual({ userId: 'user-1', openid: 'openid-1' })
  })

  it('缺少请求头时拒绝', async () => {
    const authenticate = createBearerAuthenticator(storeReturning(null))
    await expect(authenticate(requestWith())).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    })
  })

  it('非 Bearer 方案时拒绝', async () => {
    const authenticate = createBearerAuthenticator(
      storeReturning({ userId: 'user-1', openid: 'openid-1' }),
    )
    await expect(
      authenticate(requestWith('Basic 有效令牌')),
    ).rejects.toBeInstanceOf(ApiException)
  })

  it('会话不存在或已过期时拒绝', async () => {
    const authenticate = createBearerAuthenticator(storeReturning(null))
    await expect(
      authenticate(requestWith('Bearer 过期令牌')),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('令牌以摘要形式比对', () => {
    expect(hashSessionToken('令牌')).toHaveLength(64)
    expect(hashSessionToken('令牌')).not.toContain('令牌')
  })
})

describe('微信登录凭证换取', () => {
  it('返回 openid', async () => {
    const client = new HttpWeChatAuthClient(
      { appId: 'wxtest', appSecret: 'secret' },
      respondWith({ openid: 'openid-1', session_key: 'key' }),
    )
    await expect(client.codeToOpenid('code-1')).resolves.toBe('openid-1')
  })

  it('把失效凭证映射为可重试的业务错误', async () => {
    const client = new HttpWeChatAuthClient(
      { appId: 'wxtest', appSecret: 'secret' },
      respondWith({ errcode: 40029, errmsg: 'invalid code' }),
    )
    await expect(client.codeToOpenid('code-1')).rejects.toMatchObject({
      code: 'INVALID_LOGIN_CODE',
    })
  })

  it('把其他错误映射为服务不可用', async () => {
    const client = new HttpWeChatAuthClient(
      { appId: 'wxtest', appSecret: 'secret' },
      respondWith({ errcode: -1, errmsg: 'system error' }),
    )
    await expect(client.codeToOpenid('code-1')).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    })
  })

  it('请求中带上凭证与授权类型', async () => {
    const request = vi.fn(async (_url: URL) => ({
      ok: true,
      json: async () => ({ openid: 'openid-1' }),
    }))
    const client = new HttpWeChatAuthClient(
      { appId: 'wxtest', appSecret: 'secret' },
      request as unknown as typeof fetch,
    )
    await client.codeToOpenid('code-1')

    const url = request.mock.calls[0]?.[0] as unknown as URL
    expect(url.searchParams.get('js_code')).toBe('code-1')
    expect(url.searchParams.get('grant_type')).toBe('authorization_code')
    expect(url.searchParams.get('appid')).toBe('wxtest')
  })
})
