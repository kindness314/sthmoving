import type { RemoteImagePrintJob } from './types'

export function assertValidRemoteImagePrintJob(
  job: RemoteImagePrintJob,
): void {
  if (!job.id.trim()) {
    throw new Error('打印任务 ID 不能为空')
  }
  if (!Number.isInteger(job.copies) || job.copies < 1 || job.copies > 99) {
    throw new Error('打印份数必须是 1-99 的整数')
  }
  if (!job.imageUrl.startsWith('https://')) {
    throw new Error('打印图片必须使用 HTTPS 地址')
  }
  for (const [name, value] of [
    ['标签宽度', job.widthMillimetres],
    ['标签高度', job.heightMillimetres],
    ['图片宽度', job.imageWidthMillimetres],
    ['图片高度', job.imageHeightMillimetres],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${name}必须大于 0`)
    }
  }
  if (!Number.isInteger(job.density) || job.density < 1 || job.density > 9) {
    throw new Error('打印浓度必须是 1-9 的整数')
  }
  if (
    !Number.isFinite(job.gapMillimetres) ||
    job.gapMillimetres < 0 ||
    job.gapMillimetres > 8
  ) {
    throw new Error('标签间隙必须在 0-8 mm 之间')
  }
  if (
    !Number.isFinite(job.speedMillimetresPerSecond) ||
    job.speedMillimetresPerSecond < 15 ||
    job.speedMillimetresPerSecond > 60
  ) {
    throw new Error('打印速度必须在 15-60 mm/s 之间')
  }
}
