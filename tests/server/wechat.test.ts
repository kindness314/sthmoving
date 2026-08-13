import { describe, expect, it, vi } from 'vitest'

import { readMiniProgramEnvironment } from '../../cloudfunctions/api/src/labels/environment'
import { WeChatAccessTokenProvider } from '../../server/src/wechat/access-token'
import { HttpMiniProgramCodeGenerator } from '../../server/src/wechat/mini-program-code'

const credentials = { appId: 'wxtest', appSecret: 'unused' }

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
    arrayBuffer: async () =>
      new TextEncoder().encode(JSON.stringify(body)).buffer,
    headers: { get: () => 'application/json; charset=utf-8' },
  } as unknown as Response
}

function imageResponse(bytes: number[]): Response {
  return {
    ok: true,
    json: async () => ({}),
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
    headers: { get: () => 'image/jpeg' },
  } as unknown as Response
}

function tokenProviderWith(
  responses: Response[],
  now: () => number = () => 1_000_000,
) {
  const request = vi.fn(async () => responses.shift() ?? jsonResponse({}, false))
  return {
    request,
    provider: new WeChatAccessTokenProvider(
      credentials,
      request as unknown as typeof fetch,
      now,
    ),
  }
}

describe('微信接口凭证', () => {
  it('缓存有效期内的凭证', async () => {
    const { provider, request } = tokenProviderWith([
      jsonResponse({ access_token: '凭证一', expires_in: 7200 }),
    ])

    await expect(provider.getToken()).resolves.toBe('凭证一')
    await expect(provider.getToken()).resolves.toBe('凭证一')
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('并发获取只发起一次请求', async () => {
    let release: (response: Response) => void = () => {}
    const request = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve
        }),
    )
    const provider = new WeChatAccessTokenProvider(
      credentials,
      request as unknown as typeof fetch,
    )

    const pending = [provider.getToken(), provider.getToken(), provider.getToken()]
    release(jsonResponse({ access_token: '共享凭证', expires_in: 7200 }))

    await expect(Promise.all(pending)).resolves.toEqual([
      '共享凭证',
      '共享凭证',
      '共享凭证',
    ])
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('进入安全边界后提前刷新', async () => {
    let currentTime = 1_000_000
    const { provider, request } = tokenProviderWith(
      [
        jsonResponse({ access_token: '凭证一', expires_in: 7200 }),
        jsonResponse({ access_token: '凭证二', expires_in: 7200 }),
      ],
      () => currentTime,
    )

    await expect(provider.getToken()).resolves.toBe('凭证一')
    currentTime += 7000 * 1000
    await expect(provider.getToken()).resolves.toBe('凭证二')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('作废后重新获取', async () => {
    const { provider, request } = tokenProviderWith([
      jsonResponse({ access_token: '凭证一', expires_in: 7200 }),
      jsonResponse({ access_token: '凭证二', expires_in: 7200 }),
    ])

    await provider.getToken()
    provider.invalidate()
    await expect(provider.getToken()).resolves.toBe('凭证二')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('微信返回错误时抛出服务不可用', async () => {
    const { provider } = tokenProviderWith([
      jsonResponse({ errcode: 40013, errmsg: 'invalid appid' }),
    ])
    await expect(provider.getToken()).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    })
  })

  it('获取失败后允许重试', async () => {
    const { provider, request } = tokenProviderWith([
      jsonResponse({ errcode: -1 }),
      jsonResponse({ access_token: '凭证一', expires_in: 7200 }),
    ])

    await expect(provider.getToken()).rejects.toBeTruthy()
    await expect(provider.getToken()).resolves.toBe('凭证一')
    expect(request).toHaveBeenCalledTimes(2)
  })
})

describe('小程序码生成', () => {
  const accessTokens = {
    getToken: async () => '凭证一',
    invalidate: () => {},
  }

  const input = {
    page: 'pages/item-detail/index',
    scene: 'i=A1B2C3D4E5F6',
    environment: 'release',
  } as const

  it('返回图片字节', async () => {
    const request = vi.fn(async () => imageResponse([0xff, 0xd8, 0xff]))
    const generator = new HttpMiniProgramCodeGenerator(
      accessTokens,
      request as unknown as typeof fetch,
    )

    await expect(generator.generate(input)).resolves.toEqual(
      Buffer.from([0xff, 0xd8, 0xff]),
    )
  })

  it('按环境传递校验路径与版本', async () => {
    const request = vi.fn(async (_url: URL, _init?: RequestInit) =>
      imageResponse([0xff, 0xd8, 0xff]),
    )
    const generator = new HttpMiniProgramCodeGenerator(
      accessTokens,
      request as unknown as typeof fetch,
    )

    await generator.generate({ ...input, environment: 'develop' })
    const init = request.mock.calls[0]?.[1] as unknown as RequestInit
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body['env_version']).toBe('develop')
    expect(body['check_path']).toBe(false)
    expect(body['scene']).toBe('i=A1B2C3D4E5F6')
  })

  it('凭证失效时作废并重试一次', async () => {
    const invalidate = vi.fn()
    const responses = [
      jsonResponse({ errcode: 40001, errmsg: 'invalid credential' }),
      imageResponse([0x89, 0x50, 0x4e, 0x47]),
    ]
    const request = vi.fn(async () => responses.shift() as Response)
    const generator = new HttpMiniProgramCodeGenerator(
      { getToken: async () => '凭证一', invalidate },
      request as unknown as typeof fetch,
    )

    await expect(generator.generate(input)).resolves.toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    )
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('重试后仍然失效则抛出', async () => {
    const request = vi.fn(async () => jsonResponse({ errcode: 40001 }))
    const generator = new HttpMiniProgramCodeGenerator(
      accessTokens,
      request as unknown as typeof fetch,
    )

    await expect(generator.generate(input)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('其他错误码直接抛出', async () => {
    const request = vi.fn(async () => jsonResponse({ errcode: 45009 }))
    const generator = new HttpMiniProgramCodeGenerator(
      accessTokens,
      request as unknown as typeof fetch,
    )

    await expect(generator.generate(input)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    })
    expect(request).toHaveBeenCalledTimes(1)
  })
})

describe('小程序环境读取', () => {
  it('接受三种合法环境', () => {
    expect(readMiniProgramEnvironment('trial', 'develop')).toBe('trial')
    expect(readMiniProgramEnvironment('release', 'develop')).toBe('release')
  })

  it('非法或缺失时回落到默认值', () => {
    expect(readMiniProgramEnvironment(undefined, 'develop')).toBe('develop')
    expect(readMiniProgramEnvironment('production', 'release')).toBe('release')
  })
})
