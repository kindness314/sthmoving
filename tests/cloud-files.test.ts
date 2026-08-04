import { describe, expect, it } from 'vitest'

import { buildCloudFileUrlMap } from '../miniprogram/services/cloud-files'

describe('云存储图片地址', () => {
  it('将云文件 ID 映射为临时 HTTPS 地址', () => {
    const fileId = 'cloud://env/items/table.jpg'
    const urls = buildCloudFileUrlMap([fileId], [
      {
        fileID: fileId,
        tempFileURL: 'https://example.test/table.jpg',
        maxAge: 3600,
        status: 0,
        errMsg: 'cloud.getTempFileURL:ok',
      },
    ])

    expect(urls.get(fileId)).toBe('https://example.test/table.jpg')
  })

  it('云文件解析失败时返回明确错误', () => {
    const fileId = 'cloud://env/items/missing.jpg'
    expect(() =>
      buildCloudFileUrlMap([fileId], [
        {
          fileID: fileId,
          tempFileURL: '',
          maxAge: 0,
          status: -1,
          errMsg: '文件不存在',
        },
      ]),
    ).toThrow('文件不存在')
  })
})
