export async function resolveCloudFileUrls(
  fileIds: string[],
): Promise<Map<string, string>> {
  const uniqueFileIds = [...new Set(fileIds.filter(Boolean))]
  if (uniqueFileIds.length === 0) {
    return new Map()
  }
  const result = await wx.cloud.getTempFileURL({
    fileList: uniqueFileIds,
  })
  return buildCloudFileUrlMap(uniqueFileIds, result.fileList)
}

export function buildCloudFileUrlMap(
  requestedFileIds: string[],
  files: ICloud.GetTempFileURLResultItem[],
): Map<string, string> {
  const urls = new Map<string, string>()
  for (const fileId of requestedFileIds) {
    const file = files.find((item) => item.fileID === fileId)
    if (!file || file.status !== 0 || !file.tempFileURL) {
      throw new Error(file?.errMsg || '获取云存储图片地址失败')
    }
    urls.set(fileId, file.tempFileURL)
  }
  return urls
}
