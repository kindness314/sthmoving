export const MAX_ORIGINAL_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_PROCESSED_IMAGE_BYTES = 2 * 1024 * 1024
export const MAX_IMAGE_EDGE = 2048

export interface CompressionTarget {
  quality: number
  compressedWidth?: number
  compressedHeight?: number
}

const compressionProfiles = [
  { edge: 2048, quality: 80 },
  { edge: 1600, quality: 65 },
  { edge: 1280, quality: 50 },
  { edge: 1024, quality: 40 },
] as const

export function getCompressionTargets(
  width: number,
  height: number,
): CompressionTarget[] {
  const landscape = width >= height
  return compressionProfiles.map(({ edge, quality }) =>
    landscape
      ? { quality, compressedWidth: Math.min(width, edge) }
      : { quality, compressedHeight: Math.min(height, edge) },
  )
}

export function validateOriginalImageSize(size: number): string | null {
  if (size > MAX_ORIGINAL_IMAGE_BYTES) {
    return '单张原图不能超过 10 MB'
  }
  return null
}
