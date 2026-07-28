import type { MonochromeBitmap } from './types'

export const T50_PRO_DOTS_PER_MILLIMETRE = 8
export const DEFAULT_LABEL_SIZE_MM = 30

export function createEmptyLabelBitmap(
  sizeMillimetres = DEFAULT_LABEL_SIZE_MM,
): MonochromeBitmap {
  if (!Number.isInteger(sizeMillimetres) || sizeMillimetres < 1) {
    throw new Error('标签尺寸必须是大于 0 的整数毫米值')
  }

  const widthDots = sizeMillimetres * T50_PRO_DOTS_PER_MILLIMETRE
  const heightDots = widthDots
  const bytesPerRow = Math.ceil(widthDots / 8)

  return {
    widthDots,
    heightDots,
    bytesPerRow,
    data: new Uint8Array(bytesPerRow * heightDots),
  }
}
