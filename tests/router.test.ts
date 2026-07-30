import { describe, expect, it } from 'vitest'

import { route } from '../cloudfunctions/api/src/router'

const context = { openid: 'openid-for-test' }

describe('云函数 API 路由', () => {
  it('提供可验证的健康检查', async () => {
    await expect(
      route({ module: 'system', action: 'ping', payload: {} }, context),
    ).resolves.toEqual({
      ok: true,
      data: {
        service: 'sthmoving-cloud-api',
        openidAvailable: true,
      },
    })
  })

  it('明确标识尚未实现的业务接口', async () => {
    const response = await route(
      { module: 'outbound', action: 'create', payload: {} },
      context,
    )
    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.error.code).toBe('NOT_IMPLEMENTED')
    }
  })

  it('物品登记接口拒绝缺少必填字段的请求', async () => {
    const response = await route(
      { module: 'items', action: 'create', payload: {} },
      context,
    )
    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.error.code).toBe('INVALID_REQUEST')
    }
  })
})
