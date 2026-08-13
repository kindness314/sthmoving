import { describe, expect, it, vi } from 'vitest'

import type {
  UploadDependencies,
  UploadTicket,
} from '../miniprogram/services/file-upload'
import {
  contentTypeForPath,
  uploadFile,
} from '../miniprogram/services/file-upload'

function createDependencies(
  overrides: Partial<UploadDependencies> = {},
): UploadDependencies {
  let issued = 0
  return {
    requestTicket: async (): Promise<UploadTicket> => {
      issued += 1
      return {
        reference: `file://items/user-1/${issued}.jpg`,
        uploadUrl: `https://files.test/files/items/user-1/${issued}.jpg?signature=x`,
      }
    },
    readFile: async () => new ArrayBuffer(8),
    putFile: async () => {},
    ...overrides,
  }
}

describe('图片内容类型推断', () => {
  it('按扩展名推断', () => {
    expect(contentTypeForPath('/tmp/a.png')).toBe('image/png')
    expect(contentTypeForPath('/tmp/a.JPEG')).toBe('image/jpeg')
    expect(contentTypeForPath('/tmp/a.webp')).toBe('image/webp')
  })

  it('无法识别时按 JPEG 处理', () => {
    expect(contentTypeForPath('/tmp/a.heic')).toBe('image/jpeg')
    expect(contentTypeForPath('/tmp/无扩展名')).toBe('image/jpeg')
  })
})

describe('两段式上传', () => {
  it('先申请再上传并返回文件引用', async () => {
    const putFile = vi.fn(async () => {})
    const deps = createDependencies({ putFile })

    await expect(uploadFile(deps, 'ITEM_IMAGE', '/tmp/a.png')).resolves.toBe(
      'file://items/user-1/1.jpg',
    )
    expect(putFile).toHaveBeenCalledWith(
      'https://files.test/files/items/user-1/1.jpg?signature=x',
      expect.any(ArrayBuffer),
      'image/png',
    )
  })

  it('申请时带上用途与内容类型', async () => {
    const requestTicket = vi.fn(async () => ({
      reference: 'file://avatars/user-1/a.png',
      uploadUrl: 'https://files.test/upload',
    }))
    await uploadFile(createDependencies({ requestTicket }), 'AVATAR', '/tmp/a.png')
    expect(requestTicket).toHaveBeenCalledWith('AVATAR', 'image/png')
  })

  it('连续上传按顺序返回引用', async () => {
    const deps = createDependencies()
    await expect(uploadFile(deps, 'ITEM_IMAGE', '/tmp/a.png')).resolves.toBe(
      'file://items/user-1/1.jpg',
    )
    await expect(uploadFile(deps, 'ITEM_IMAGE', '/tmp/b.png')).resolves.toBe(
      'file://items/user-1/2.jpg',
    )
  })

  it('上传失败时抛出且不返回引用', async () => {
    const deps = createDependencies({
      putFile: async () => {
        throw new Error('网络错误')
      },
    })
    await expect(
      uploadFile(deps, 'ITEM_IMAGE', '/tmp/a.png'),
    ).rejects.toThrow('网络错误')
  })
})
