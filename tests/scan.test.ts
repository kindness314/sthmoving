import { describe, expect, it } from 'vitest'

import { extractScene, parseScanTarget } from '../miniprogram/pages/scan/parser'

describe('内置扫码结果解析', () => {
  it('解析微信小程序码返回的 path 和 scene', () => {
    expect(
      parseScanTarget({
        path: 'pages/item-detail/index?scene=i%3DA1B2C3D4E5F6',
      }),
    ).toBe('/pages/item-detail/index?scene=i%3DA1B2C3D4E5F6')
    expect(
      parseScanTarget({
        result: 'https://example.test/pages/item-detail/index?scene=i%3Da1b2c3d4e5f6',
      }),
    ).toBe('/pages/item-detail/index?scene=i%3DA1B2C3D4E5F6')
  })

  it('兼容前导斜线、重复编码和直接返回物品编码', () => {
    expect(
      parseScanTarget({
        path: '%2Fpages%2Fitem-detail%2Findex%3Fscene%3Di%253DA1B2C3D4E5F6',
      }),
    ).toBe('/pages/item-detail/index?scene=i%3DA1B2C3D4E5F6')
    expect(extractScene('a1b2c3d4e5f6')).toBe('i=A1B2C3D4E5F6')
  })

  it('拒绝无法映射到物品标签的内容', () => {
    expect(parseScanTarget({ result: '普通二维码内容' })).toBeNull()
    expect(extractScene('i=not-a-label')).toBeNull()
  })
})
