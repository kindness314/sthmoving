export interface StoredFile {
  readonly content: Buffer
  readonly contentType: string
}

export interface FileStorage {
  write(path: string, content: Buffer): Promise<void>
  read(path: string): Promise<Buffer | null>
  delete(paths: readonly string[]): Promise<void>
}

export const allowedContentTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export type AllowedContentType = (typeof allowedContentTypes)[number]

export const filePurposes = ['ITEM_IMAGE', 'AVATAR', 'LABEL'] as const

export type FilePurpose = (typeof filePurposes)[number]

export const maxUploadBytes = 5 * 1024 * 1024

export function isAllowedContentType(
  value: unknown,
): value is AllowedContentType {
  return (
    typeof value === 'string' &&
    (allowedContentTypes as readonly string[]).includes(value)
  )
}

export function isFilePurpose(value: unknown): value is FilePurpose {
  return (
    typeof value === 'string' && (filePurposes as readonly string[]).includes(value)
  )
}

export function extensionForContentType(contentType: AllowedContentType): string {
  switch (contentType) {
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    default:
      return 'jpg'
  }
}
