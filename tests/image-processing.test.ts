import { describe, expect, it } from 'vitest'

import {
  getCompressionTargets,
  MAX_ORIGINAL_IMAGE_BYTES,
  validateOriginalImageSize,
} from '../miniprogram/domain/image-processing'

describe('物品图片处理参数', () => {
  it('横图按宽度逐级缩放，竖图按高度逐级缩放', () => {
    expect(getCompressionTargets(4000, 3000)).toEqual([
      { quality: 80, compressedWidth: 2048 },
      { quality: 65, compressedWidth: 1600 },
      { quality: 50, compressedWidth: 1280 },
      { quality: 40, compressedWidth: 1024 },
    ])
    expect(getCompressionTargets(2000, 4000)[0]).toEqual({
      quality: 80,
      compressedHeight: 2048,
    })
  })

  it('拒绝大于 10 MB 的原图', () => {
    expect(validateOriginalImageSize(MAX_ORIGINAL_IMAGE_BYTES)).toBeNull()
    expect(
      validateOriginalImageSize(MAX_ORIGINAL_IMAGE_BYTES + 1),
    ).toBe('单张原图不能超过 10 MB')
  })
})
