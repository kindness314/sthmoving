import { describe, expect, it } from 'vitest'

import { createApiClientError } from '../miniprogram/services/cloud-api'

describe('云 API 客户端错误', () => {
  it('向界面提供人类可读消息，同时保留错误码供程序判断', () => {
    const error = createApiClientError({
      code: 'CATEGORY_NAME_EXISTS',
      message: '已存在同名分类',
    })

    expect(error.message).toBe('已存在同名分类')
    expect(error.message).not.toContain('CATEGORY_NAME_EXISTS')
    expect(error.code).toBe('CATEGORY_NAME_EXISTS')
  })
})
