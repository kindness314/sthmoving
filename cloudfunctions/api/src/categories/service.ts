import { createHash } from 'node:crypto'

import { ApiException } from '../errors'
import type { UserRecord } from '../membership/types'
import type {
  CategoryRepository,
  CategoryUnitOfWork,
} from './repository'
import type { CategoryRecord, PublicCategory } from './types'

export const presetCategoryNames = [
  '日常用品',
  '清洁用品',
  '技术设备',
  '电脑配件',
  '装饰品',
  '招新用品',
  '纸质材料',
  '待认领物品',
  '个人存放物品',
] as const

export class CategoryService {
  constructor(
    private readonly repository: CategoryRepository,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async list(openid: string): Promise<PublicCategory[]> {
    return this.repository.runTransaction(async (unitOfWork) => {
      requireApprovedUser(
        await unitOfWork.getUserByOpenid(openid),
        openid,
      )
      await this.ensurePresetCategories(unitOfWork)
      const categories = await unitOfWork.listActiveCategories()
      return categories
        .sort(compareCategories)
        .map(toPublicCategory)
    })
  }

  async create(openid: string, nameInput: string): Promise<PublicCategory> {
    const name = validateCategoryName(nameInput)
    const normalizedName = normalizeCategoryName(name)
    const categoryId = createCategoryId(normalizedName)

    return this.repository.runTransaction(async (unitOfWork) => {
      const user = await unitOfWork.getUserByOpenid(openid)
      requireApprovedUser(user, openid)
      await this.ensurePresetCategories(unitOfWork)

      if (await unitOfWork.getCategory(categoryId)) {
        throw new ApiException(
          'CATEGORY_NAME_EXISTS',
          '已存在同名分类',
        )
      }

      const now = this.now()
      const category: CategoryRecord = {
        _id: categoryId,
        name,
        normalized_name: normalizedName,
        status: 'ACTIVE',
        is_preset: false,
        sort_order: 1000,
        created_by: user._id,
        created_at: now,
        updated_at: now,
      }
      await unitOfWork.setCategory(category)
      return toPublicCategory(category)
    })
  }

  private async ensurePresetCategories(
    unitOfWork: CategoryUnitOfWork,
  ): Promise<void> {
    const now = this.now()
    for (const [index, name] of presetCategoryNames.entries()) {
      const normalizedName = normalizeCategoryName(name)
      const categoryId = createCategoryId(normalizedName)
      if (await unitOfWork.getCategory(categoryId)) {
        continue
      }
      await unitOfWork.setCategory({
        _id: categoryId,
        name,
        normalized_name: normalizedName,
        status: 'ACTIVE',
        is_preset: true,
        sort_order: index,
        created_by: 'SYSTEM',
        created_at: now,
        updated_at: now,
      })
    }
  }
}

function requireApprovedUser(
  user: UserRecord | null,
  openid: string,
): asserts user is UserRecord {
  if (!user || user.openid !== openid) {
    throw new ApiException('UNAUTHENTICATED', '当前微信用户尚未建立账号')
  }
  if (user.status !== 'APPROVED') {
    throw new ApiException('ACCOUNT_NOT_ACTIVE', '当前账号尚未通过审核')
  }
}

function validateCategoryName(value: string): string {
  const name = value.trim()
  if (name.length < 1 || name.length > 40) {
    throw new ApiException(
      'INVALID_CATEGORY_NAME',
      '分类名称长度应为 1 至 40 个字符',
    )
  }
  return name
}

function normalizeCategoryName(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase('zh-CN')
}

function createCategoryId(normalizedName: string): string {
  const digest = createHash('sha256')
    .update(normalizedName)
    .digest('hex')
    .slice(0, 24)
  return `category-${digest}`
}

function compareCategories(
  left: CategoryRecord,
  right: CategoryRecord,
): number {
  if (left.is_preset !== right.is_preset) {
    return left.is_preset ? -1 : 1
  }
  if (left.is_preset) {
    return left.sort_order - right.sort_order
  }
  return left.name.localeCompare(right.name, 'zh-CN')
}

function toPublicCategory(category: CategoryRecord): PublicCategory {
  return {
    id: category._id,
    name: category.name,
    status: category.status,
    isPreset: category.is_preset,
    createdBy: category.created_by,
    createdAt: category.created_at,
    updatedAt: category.updated_at,
  }
}
