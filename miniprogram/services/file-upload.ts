import { requestUploadTicket } from './cloud-api'

export type UploadPurpose = 'ITEM_IMAGE' | 'AVATAR'

export interface UploadTicket {
  reference: string
  uploadUrl: string
}

export interface UploadDependencies {
  requestTicket(
    purpose: UploadPurpose,
    contentType: string,
  ): Promise<UploadTicket>
  readFile(filePath: string): Promise<ArrayBuffer>
  putFile(
    uploadUrl: string,
    content: ArrayBuffer,
    contentType: string,
  ): Promise<void>
}

const contentTypeByExtension: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export function contentTypeForPath(filePath: string): string {
  const extension = /\.([a-zA-Z0-9]+)(?:\?|$)/u
    .exec(filePath)?.[1]
    ?.toLowerCase()
  return (extension && contentTypeByExtension[extension]) || 'image/jpeg'
}

export async function uploadFile(
  deps: UploadDependencies,
  purpose: UploadPurpose,
  filePath: string,
): Promise<string> {
  const contentType = contentTypeForPath(filePath)
  const ticket = await deps.requestTicket(purpose, contentType)
  const content = await deps.readFile(filePath)
  await deps.putFile(ticket.uploadUrl, content, contentType)
  return ticket.reference
}

export function readTempFile(filePath: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      success: ({ data }) => resolve(data as ArrayBuffer),
      fail: reject,
    })
  })
}

export function putUploadedFile(
  uploadUrl: string,
  content: ArrayBuffer,
  contentType: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: uploadUrl,
      method: 'PUT',
      header: { 'content-type': contentType },
      data: content,
      success: ({ statusCode }) => {
        if (statusCode >= 200 && statusCode < 300) {
          resolve()
          return
        }
        reject(new Error(`上传失败，状态码 ${statusCode}`))
      },
      fail: reject,
    })
  })
}

export const uploadDependencies: UploadDependencies = {
  requestTicket: requestUploadTicket,
  readFile: readTempFile,
  putFile: putUploadedFile,
}
