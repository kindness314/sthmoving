import cloud from 'wx-server-sdk'

export interface OutboundImageStorage {
  delete(fileIds: readonly string[]): Promise<void>
}

export class CloudOutboundImageStorage implements OutboundImageStorage {
  async delete(fileIds: readonly string[]): Promise<void> {
    const uniqueFileIds = [...new Set(fileIds.filter(Boolean))]
    if (uniqueFileIds.length === 0) {
      return
    }
    await cloud.deleteFile({ fileList: uniqueFileIds })
  }
}
