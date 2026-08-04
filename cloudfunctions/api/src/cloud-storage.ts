import cloud from 'wx-server-sdk'
import type { ICloud } from 'wx-server-sdk'

export class CloudStorageUrlResolver {
  async resolve(fileIds: string[]): Promise<Map<string, string>> {
    const uniqueFileIds = [...new Set(fileIds.filter(Boolean))]
    if (uniqueFileIds.length === 0) {
      return new Map()
    }
    const result = (await cloud.getTempFileURL({
      fileList: uniqueFileIds,
    })) as ICloud.GetTempFileURLResult
    const urls = new Map<string, string>()
    for (const fileId of uniqueFileIds) {
      const file = result.fileList.find((item) => item.fileID === fileId)
      if (!file || file.status !== 0 || !file.tempFileURL) {
        throw new Error(file?.errMsg || '获取云存储图片地址失败')
      }
      urls.set(fileId, file.tempFileURL)
    }
    return urls
  }

  async resolveOne(fileId: string): Promise<string> {
    const urls = await this.resolve([fileId])
    const url = urls.get(fileId)
    if (!url) {
      throw new Error('获取云存储图片地址失败')
    }
    return url
  }
}
