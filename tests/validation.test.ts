import { describe, expect, it } from 'vitest'

import {
  validateCommitSummary,
  validateImageCount,
  validateQuantity,
} from '../miniprogram/domain/validation'

describe('物品输入校验', () => {
  it('限制最多两张图片', () => {
    expect(validateImageCount(['a', 'b'])).toBeNull()
    expect(validateImageCount(['a', 'b', 'c'])).toContain('最多上传 2 张')
  })

  it('要求提交梗概有实际内容', () => {
    expect(validateCommitSummary('更新设备数量')).toBeNull()
    expect(validateCommitSummary(' 短 ')).not.toBeNull()
  })

  it('区分单件和多件数量', () => {
    expect(validateQuantity('SINGLE', 1)).toBeNull()
    expect(validateQuantity('SINGLE', 2)).not.toBeNull()
    expect(validateQuantity('MULTIPLE', 8)).toBeNull()
    expect(validateQuantity('MULTIPLE', 0)).not.toBeNull()
  })
})
