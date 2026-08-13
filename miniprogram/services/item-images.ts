import {
  getCompressionTargets,
  MAX_IMAGE_EDGE,
  MAX_PROCESSED_IMAGE_BYTES,
  validateOriginalImageSize,
} from '../domain/image-processing'
import { discardFiles } from './cloud-api'
import { uploadDependencies, uploadFile } from './file-upload'

export interface PreparedItemImage {
  tempFilePath: string
  size: number
}

export async function chooseAndPrepareItemImages(
  count: number,
): Promise<PreparedItemImage[]> {
  const result = await wx.chooseMedia({
    count,
    mediaType: ['image'],
    sourceType: ['album', 'camera'],
    sizeType: ['original'],
  })

  const prepared: PreparedItemImage[] = []
  for (const file of result.tempFiles) {
    const sizeError = validateOriginalImageSize(file.size)
    if (sizeError) {
      throw new Error(sizeError)
    }
    prepared.push(await compressItemImage(file))
  }
  return prepared
}

export async function uploadItemImages(
  images: readonly PreparedItemImage[],
): Promise<string[]> {
  const fileIds: string[] = []
  try {
    for (const image of images) {
      fileIds.push(
        await uploadFile(uploadDependencies, 'ITEM_IMAGE', image.tempFilePath),
      )
    }
    return fileIds
  } catch (error) {
    await deleteUploadedItemImages(fileIds)
    throw error
  }
}

export async function deleteUploadedItemImages(
  fileIds: readonly string[],
): Promise<void> {
  if (!fileIds.length) {
    return
  }
  try {
    await discardFiles(fileIds)
  } catch (error) {
    console.error('清理未使用的物品图片失败', error)
  }
}

async function compressItemImage(
  file: WechatMiniprogram.MediaFile,
): Promise<PreparedItemImage> {
  const dimensions =
    file.width > 0 && file.height > 0
      ? { width: file.width, height: file.height }
      : await wx.getImageInfo({ src: file.tempFilePath })
  if (
    file.size <= MAX_PROCESSED_IMAGE_BYTES &&
    Math.max(dimensions.width, dimensions.height) <= MAX_IMAGE_EDGE
  ) {
    return {
      tempFilePath: file.tempFilePath,
      size: file.size,
    }
  }

  for (const target of getCompressionTargets(
    dimensions.width,
    dimensions.height,
  )) {
    const result = await wx.compressImage({
      src: file.tempFilePath,
      ...target,
    })
    const size = await getFileSize(result.tempFilePath)
    if (size <= MAX_PROCESSED_IMAGE_BYTES) {
      return {
        tempFilePath: result.tempFilePath,
        size,
      }
    }
  }
  throw new Error('图片压缩后仍超过 2 MB，请更换图片')
}

function getFileSize(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().getFileInfo({
      filePath,
      success: ({ size }) => resolve(size),
      fail: reject,
    })
  })
}

