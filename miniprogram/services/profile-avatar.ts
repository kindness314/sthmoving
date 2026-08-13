import { discardFiles, resolveFileUrls } from './cloud-api'
import { uploadDependencies, uploadFile } from './file-upload'

const MAX_AVATAR_BYTES = 5 * 1024 * 1024

export async function chooseProfileAvatar(): Promise<string> {
  const result = await wx.chooseMedia({
    count: 1,
    mediaType: ['image'],
    sourceType: ['album', 'camera'],
    sizeType: ['compressed'],
  })
  const file = result.tempFiles[0]
  if (!file) {
    throw new Error('未选择头像')
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error('头像不能超过 5 MB')
  }
  return file.tempFilePath
}

export function uploadProfileAvatar(filePath: string): Promise<string> {
  return uploadFile(uploadDependencies, 'AVATAR', filePath)
}

export async function resolveProfileAvatar(
  fileId: string | undefined,
): Promise<string> {
  if (!fileId) {
    return ''
  }
  if (!fileId.startsWith('file://') && !fileId.startsWith('cloud://')) {
    return fileId
  }
  const urls = await resolveFileUrls([fileId])
  return urls[fileId] ?? ''
}

export async function deleteProfileAvatar(
  fileId: string | undefined,
): Promise<void> {
  if (!fileId) {
    return
  }
  try {
    await discardFiles([fileId])
  } catch (error) {
    console.error('清理旧头像失败', error)
  }
}
