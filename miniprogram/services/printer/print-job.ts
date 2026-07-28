import type { BitmapPrintJob } from './types'

export function assertValidPrintJob(job: BitmapPrintJob): void {
  if (!job.id.trim()) {
    throw new Error('打印任务 ID 不能为空')
  }
  if (!Number.isInteger(job.copies) || job.copies < 1) {
    throw new Error('打印份数必须是大于 0 的整数')
  }

  const { bitmap } = job
  if (bitmap.widthDots < 1 || bitmap.heightDots < 1) {
    throw new Error('位图尺寸无效')
  }
  const expectedBytesPerRow = Math.ceil(bitmap.widthDots / 8)
  if (bitmap.bytesPerRow !== expectedBytesPerRow) {
    throw new Error('位图行宽与像素宽度不匹配')
  }
  if (bitmap.data.length !== bitmap.bytesPerRow * bitmap.heightDots) {
    throw new Error('位图数据长度与尺寸不匹配')
  }
}
