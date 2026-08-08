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
      { module: 'notifications', action: 'create', payload: {} },
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

  it('物品登记接口拒绝同时提交已有分类和新分类', async () => {
    const response = await route(
      {
        module: 'items',
        action: 'create',
        payload: {
          name: '折叠桌',
          images: [],
          description: '',
          quantityMode: 'SINGLE',
          quantity: 1,
          categoryId: 'category-existing',
          newCategoryName: '活动器材',
          commitSummary: '首次登记物品',
        },
      },
      context,
    )
    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.error.code).toBe('INVALID_CATEGORY_SELECTION')
    }
  })

  it('物品更新接口拒绝无效版本字段', async () => {
    const response = await route(
      {
        module: 'items',
        action: 'update',
        payload: {
          itemId: 'item-1',
          expectedVersion: '1',
          name: '新名称',
          commitSummary: '修改物品名称',
        },
      },
      context,
    )
    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.error.code).toBe('INVALID_REQUEST')
    }
  })

  it('物品操作日志接口拒绝缺少物品 ID 的请求', async () => {
    const response = await route(
      { module: 'items', action: 'logs', payload: {} },
      context,
    )
    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.error.code).toBe('INVALID_REQUEST')
    }
  })

  it('离库申请接口拒绝缺少原因的请求', async () => {
    const response = await route(
      {
        module: 'outbound',
        action: 'create',
        payload: { itemId: 'item-1' },
      },
      context,
    )
    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.error.code).toBe('INVALID_REQUEST')
    }
  })

  it('同意离库接口仍要求申请 ID，但不要求审批梗概字段', async () => {
    const response = await route(
      {
        module: 'outbound',
        action: 'approve',
        payload: {},
      },
      context,
    )
    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.error.code).toBe('INVALID_REQUEST')
    }
  })

  it('直接离库接口拒绝无效版本字段', async () => {
    const response = await route(
      {
        module: 'outbound',
        action: 'direct',
        payload: {
          itemId: 'item-1',
          expectedVersion: '3',
          commitSummary: '管理员直接离库',
        },
      },
      context,
    )
    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.error.code).toBe('INVALID_REQUEST')
    }
  })

  it('重新入库接口拒绝无效版本字段', async () => {
    const response = await route(
      {
        module: 'outbound',
        action: 'restore',
        payload: {
          itemId: 'item-1',
          expectedVersion: '3',
          commitSummary: '恢复入库测试',
        },
      },
      context,
    )
    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.error.code).toBe('INVALID_REQUEST')
    }
  })

  it('批量重新入库接口拒绝无效物品列表', async () => {
    const response = await route(
      {
        module: 'outbound',
        action: 'batchRestore',
        payload: {
          items: [{ itemId: 'item-1', expectedVersion: '3' }],
          commitSummary: '批量恢复入库',
        },
      },
      context,
    )
    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.error.code).toBe('INVALID_REQUEST')
    }
  })

  it('批量离库接口拒绝无效物品列表', async () => {
    const response = await route(
      {
        module: 'outbound',
        action: 'batchDirect',
        payload: {
          items: [{ itemId: 'item-1', expectedVersion: '3' }],
          commitSummary: '批量处理离库',
        },
      },
      context,
    )
    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.error.code).toBe('INVALID_REQUEST')
    }
  })

  it('批量删除接口拒绝非数组物品 ID', async () => {
    const response = await route(
      {
        module: 'outbound',
        action: 'batchDelete',
        payload: { itemIds: 'item-1' },
      },
      context,
    )
    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.error.code).toBe('INVALID_REQUEST')
    }
  })
})
