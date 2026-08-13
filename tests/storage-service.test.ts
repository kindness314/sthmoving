import { describe, expect, it, vi } from 'vitest'

import type {
  MembershipRepository,
  MembershipUnitOfWork,
} from '../cloudfunctions/api/src/membership/repository'
import type { UserRecord } from '../cloudfunctions/api/src/membership/types'
import { isFileOwnedBy } from '../cloudfunctions/api/src/storage/file-reference'
import { StorageService } from '../cloudfunctions/api/src/storage/service'

function createUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    _id: 'user-1',
    openid: 'openid-1',
    display_name: '张三',
    role: 'MEMBER',
    status: 'APPROVED',
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
    ...overrides,
  }
}

function repositoryWith(user: UserRecord | null): MembershipRepository {
  return {
    runTransaction: (operation) =>
      operation({
        getUser: async (userId: string) =>
          user && user._id === userId ? user : null,
      } as unknown as MembershipUnitOfWork),
  }
}

function createService(
  user: UserRecord | null,
  overrides: {
    resolveFileUrls?: (fileIds: string[]) => Promise<Map<string, string>>
    deleteFiles?: (fileIds: readonly string[]) => Promise<void>
  } = {},
) {
  const deleteFiles = overrides.deleteFiles ?? vi.fn(async () => {})
  const service = new StorageService(
    repositoryWith(user),
    overrides.resolveFileUrls ??
      (async (fileIds) =>
        new Map(fileIds.map((fileId) => [fileId, `https://files.test/${fileId}`]))),
    deleteFiles,
  )
  return { service, deleteFiles }
}

describe('文件归属判定', () => {
  it('只认自建引用中属于本人的物品图片与头像', () => {
    expect(isFileOwnedBy('file://items/user-1/a.jpg', 'user-1')).toBe(true)
    expect(isFileOwnedBy('file://avatars/user-1/a.jpg', 'user-1')).toBe(true)
  })

  it('拒绝他人文件、标签文件与云存储引用', () => {
    expect(isFileOwnedBy('file://items/user-2/a.jpg', 'user-1')).toBe(false)
    expect(isFileOwnedBy('file://labels/item-1/A1B2C3D4E5F6.png', 'user-1')).toBe(
      false,
    )
    expect(isFileOwnedBy('cloud://env.abc/items/a.jpg', 'user-1')).toBe(false)
    expect(isFileOwnedBy('file://items/user-1/nested/a.jpg', 'user-1')).toBe(
      false,
    )
  })
})

describe('文件地址解析', () => {
  it('返回每个引用的临时地址', async () => {
    const { service } = createService(createUser())
    await expect(
      service.resolve('user-1', ['file://items/user-1/a.jpg']),
    ).resolves.toEqual({
      'file://items/user-1/a.jpg':
        'https://files.test/file://items/user-1/a.jpg',
    })
  })

  it('待审成员不能解析文件地址', async () => {
    const { service } = createService(createUser({ status: 'PENDING' }))
    await expect(
      service.resolve('user-1', ['file://items/user-1/a.jpg']),
    ).rejects.toMatchObject({ code: 'ACCOUNT_NOT_ACTIVE' })
  })

  it('已停用成员不能解析文件地址', async () => {
    const { service } = createService(createUser({ status: 'DISABLED' }))
    await expect(
      service.resolve('user-1', ['file://items/user-1/a.jpg']),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' })
  })

  it('拒绝非受管引用与超长列表', async () => {
    const { service } = createService(createUser())
    await expect(
      service.resolve('user-1', ['https://evil.test/a.jpg']),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(service.resolve('user-1', [])).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    })
    await expect(
      service.resolve(
        'user-1',
        Array.from({ length: 21 }, (_, index) => `file://items/user-1/${index}.jpg`),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  })
})

describe('文件丢弃', () => {
  it('只删除属于本人的文件', async () => {
    const { service, deleteFiles } = createService(createUser())

    await expect(
      service.discard('user-1', [
        'file://items/user-1/a.jpg',
        'file://items/user-2/b.jpg',
        'file://labels/item-1/A1B2C3D4E5F6.png',
      ]),
    ).resolves.toEqual({ discarded: 1 })
    expect(deleteFiles).toHaveBeenCalledWith(['file://items/user-1/a.jpg'])
  })

  it('没有可删文件时不调用存储', async () => {
    const { service, deleteFiles } = createService(createUser())

    await expect(
      service.discard('user-1', ['cloud://env.abc/items/a.jpg']),
    ).resolves.toEqual({ discarded: 0 })
    expect(deleteFiles).not.toHaveBeenCalled()
  })

  it('未登记的用户不能删除文件', async () => {
    const { service } = createService(null)
    await expect(
      service.discard('user-1', ['file://items/user-1/a.jpg']),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' })
  })
})
