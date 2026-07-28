import { describe, expect, it } from 'vitest'

import { hasPermission } from '../miniprogram/domain/permissions'

describe('hasPermission', () => {
  it('允许成员编辑物品但不允许直接离库', () => {
    expect(hasPermission('MEMBER', 'ITEM_EDIT')).toBe(true)
    expect(hasPermission('MEMBER', 'OUTBOUND_DIRECT')).toBe(false)
  })

  it('允许管理员审核离库但不允许管理管理员', () => {
    expect(hasPermission('ADMIN', 'OUTBOUND_REVIEW')).toBe(true)
    expect(hasPermission('ADMIN', 'ADMIN_MANAGE')).toBe(false)
  })

  it('仅所有者可以管理管理员', () => {
    expect(hasPermission('OWNER', 'ADMIN_MANAGE')).toBe(true)
  })
})
