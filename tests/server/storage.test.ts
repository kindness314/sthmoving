import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  isManagedFileReference,
  parseSelfHostedPath,
  toSelfHostedReference,
} from '../../cloudfunctions/api/src/storage/file-reference'
import { LocalFileStorage } from '../../server/src/storage/local'
import {
  describeFilePath,
  detectContentType,
} from '../../server/src/storage/routes'
import { FileUrlSigner } from '../../server/src/storage/signing'

const secret = 'file-signing-secret-for-automated-tests'

function signerAt(milliseconds: number): FileUrlSigner {
  return new FileUrlSigner(secret, 'https://files.test/', () => milliseconds)
}

describe('文件引用', () => {
  it('接受云存储与自建两种引用', () => {
    expect(isManagedFileReference('cloud://env.abc/items/1.jpg')).toBe(true)
    expect(isManagedFileReference('file://items/user-1/a.jpg')).toBe(true)
  })

  it('拒绝路径穿越与非法字符', () => {
    expect(parseSelfHostedPath('file://../etc/passwd')).toBeNull()
    expect(parseSelfHostedPath('file://items/../../secret')).toBeNull()
    expect(parseSelfHostedPath('file:///items/a.jpg')).toBeNull()
    expect(parseSelfHostedPath('file://items//a.jpg')).toBeNull()
    expect(parseSelfHostedPath('file://items/.hidden')).toBeNull()
    expect(parseSelfHostedPath('file://')).toBeNull()
    expect(isManagedFileReference('file://../etc/passwd')).toBe(false)
    expect(isManagedFileReference('https://evil.test/a.jpg')).toBe(false)
  })

  it('解析出可用于存储的路径', () => {
    expect(parseSelfHostedPath('file://items/user-1/a.jpg')).toBe(
      'items/user-1/a.jpg',
    )
    expect(toSelfHostedReference('items/user-1/a.jpg')).toBe(
      'file://items/user-1/a.jpg',
    )
  })
})

describe('文件地址签名', () => {
  it('签发的地址能被自己校验', () => {
    const signer = signerAt(1_700_000_000_000)
    const url = new URL(signer.sign('download', 'items/user-1/a.jpg', 600_000))
    expect(url.pathname).toBe('/files/items/user-1/a.jpg')
    expect(
      signer.verify(
        'download',
        'items/user-1/a.jpg',
        url.searchParams.get('expires'),
        url.searchParams.get('signature'),
      ),
    ).toBe(true)
  })

  it('换一个路径签名立刻失效', () => {
    const signer = signerAt(1_700_000_000_000)
    const url = new URL(signer.sign('download', 'items/user-1/a.jpg', 600_000))
    expect(
      signer.verify(
        'download',
        'labels/item-1/A1B2C3D4E5F6.png',
        url.searchParams.get('expires'),
        url.searchParams.get('signature'),
      ),
    ).toBe(false)
  })

  it('下载签名不能当作上传签名', () => {
    const signer = signerAt(1_700_000_000_000)
    const url = new URL(signer.sign('download', 'items/user-1/a.jpg', 600_000))
    expect(
      signer.verify(
        'upload',
        'items/user-1/a.jpg',
        url.searchParams.get('expires'),
        url.searchParams.get('signature'),
      ),
    ).toBe(false)
  })

  it('过期后拒绝', () => {
    const url = new URL(
      signerAt(1_700_000_000_000).sign('download', 'items/user-1/a.jpg', 600_000),
    )
    expect(
      signerAt(1_700_000_601_000).verify(
        'download',
        'items/user-1/a.jpg',
        url.searchParams.get('expires'),
        url.searchParams.get('signature'),
      ),
    ).toBe(false)
  })

  it('缺少参数或密钥过短时拒绝', () => {
    const signer = signerAt(1_700_000_000_000)
    expect(signer.verify('download', 'items/a.jpg', null, null)).toBe(false)
    expect(signer.verify('download', 'items/a.jpg', '不是数字', 'x')).toBe(false)
    expect(() => new FileUrlSigner('太短', 'https://files.test')).toThrow()
  })
})

describe('图片内容识别', () => {
  it('识别三种受支持的格式', () => {
    expect(detectContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      'image/jpeg',
    )
    expect(
      detectContentType(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
      ),
    ).toBe('image/png')
    expect(
      detectContentType(
        Buffer.concat([
          Buffer.from('RIFF', 'latin1'),
          Buffer.from([0, 0, 0, 0]),
          Buffer.from('WEBP', 'latin1'),
        ]),
      ),
    ).toBe('image/webp')
  })

  it('拒绝其他内容', () => {
    expect(detectContentType(Buffer.from('<svg></svg>', 'utf8'))).toBeNull()
    expect(detectContentType(Buffer.alloc(0))).toBeNull()
  })
})

describe('文件路径归类', () => {
  it('识别用途与归属', () => {
    expect(describeFilePath('items/user-1/a.jpg')).toEqual({
      purpose: 'ITEM_IMAGE',
      ownerId: 'user-1',
    })
    expect(describeFilePath('avatars/user-1/a.jpg')).toEqual({
      purpose: 'AVATAR',
      ownerId: 'user-1',
    })
    expect(describeFilePath('labels/item-1/A1B2C3D4E5F6.png')).toEqual({
      purpose: 'LABEL',
      ownerId: null,
    })
  })

  it('拒绝不认识的路径形态', () => {
    expect(describeFilePath('items/a.jpg')).toBeNull()
    expect(describeFilePath('other/user-1/a.jpg')).toBeNull()
    expect(describeFilePath('items/user-1/nested/a.jpg')).toBeNull()
  })
})

describe('本地卷存储', () => {
  let root: string
  let storage: LocalFileStorage

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'sthmoving-storage-'))
    storage = new LocalFileStorage(root)
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('写入后能读回并删除', async () => {
    const content = Buffer.from('图片内容', 'utf8')
    await storage.write('items/user-1/a.jpg', content)
    await expect(storage.read('items/user-1/a.jpg')).resolves.toEqual(content)
    await storage.delete(['items/user-1/a.jpg'])
    await expect(storage.read('items/user-1/a.jpg')).resolves.toBeNull()
  })

  it('读取不存在的文件返回空', async () => {
    await expect(storage.read('items/user-1/缺失.jpg')).resolves.toBeNull()
  })

  it('拒绝越出存储根目录的路径', async () => {
    await expect(
      storage.write('../越界.jpg', Buffer.from('x')),
    ).rejects.toThrow('文件路径越出存储根目录')
    await expect(storage.read('../../etc/passwd')).rejects.toThrow(
      '文件路径越出存储根目录',
    )
  })

  it('删除不存在的文件不报错', async () => {
    await expect(storage.delete(['items/user-1/缺失.jpg'])).resolves.toBeUndefined()
  })
})
