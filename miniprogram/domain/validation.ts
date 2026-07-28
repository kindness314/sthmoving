import type { QuantityMode } from '../types/domain'

export const MAX_ITEM_IMAGES = 2
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MIN_COMMIT_SUMMARY_LENGTH = 5
export const MAX_COMMIT_SUMMARY_LENGTH = 100

export function validateCommitSummary(summary: string): string | null {
  const length = summary.trim().length
  if (
    length < MIN_COMMIT_SUMMARY_LENGTH ||
    length > MAX_COMMIT_SUMMARY_LENGTH
  ) {
    return `提交梗概需为 ${MIN_COMMIT_SUMMARY_LENGTH}-${MAX_COMMIT_SUMMARY_LENGTH} 个字符`
  }
  return null
}

export function validateImageCount(imageFileIds: readonly string[]): string | null {
  if (imageFileIds.length > MAX_ITEM_IMAGES) {
    return `物品最多上传 ${MAX_ITEM_IMAGES} 张图片`
  }
  return null
}

export function validateQuantity(
  mode: QuantityMode,
  quantity: number,
): string | null {
  if (!Number.isInteger(quantity) || quantity < 1) {
    return '数量必须是大于 0 的整数'
  }
  if (mode === 'SINGLE' && quantity !== 1) {
    return '单件物品的数量必须为 1'
  }
  return null
}
