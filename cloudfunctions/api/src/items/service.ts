import { randomBytes, randomUUID } from 'node:crypto'

import { ApiException } from '../errors'
import type { UserRecord } from '../membership/types'
import type { ItemRepository } from './repository'
import type {
  CreateItemInput,
  ItemRecord,
  PublicItem,
} from './types'

export class ItemService {
  constructor(
    private readonly repository: ItemRepository,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly createItemId: () => string = () =>
      `item-${randomUUID()}`,
    private readonly createLogId: () => string = () =>
      `item-log-${randomUUID()}`,
    private readonly createPublicCode: () => string = () =>
      randomBytes(6).toString('hex').toUpperCase(),
  ) {}

  async create(openid: string, input: CreateItemInput): Promise<PublicItem> {
    const validated = validateCreateInput(input)

    return this.repository.runTransaction(async (unitOfWork) => {
      const user = await unitOfWork.getUserByOpenid(openid)
      requireApprovedUser(user, openid)

      const category = await unitOfWork.getCategory(validated.categoryId)
      if (!category) {
        throw new ApiException('CATEGORY_NOT_FOUND', '分类不存在')
      }
      if (category.status !== 'ACTIVE') {
        throw new ApiException(
          'CATEGORY_DISABLED',
          '该分类已停用，不能用于登记物品',
        )
      }

      await unitOfWork.setCategory({
        ...category,
        item_reference_count:
          (category.item_reference_count ?? 0) + 1,
      })

      const now = this.now()
      const item: ItemRecord = {
        _id: this.createItemId(),
        code: this.createPublicCode(),
        name: validated.name,
        images: validated.images,
        description: validated.description,
        quantity_mode: validated.quantityMode,
        quantity: validated.quantity,
        category_id: validated.categoryId,
        status: 'ACTIVE',
        version: 1,
        registered_by: user._id,
        registered_at: now,
        updated_by: user._id,
        updated_at: now,
      }

      await unitOfWork.setItem(item)
      await unitOfWork.setOperationLog({
        _id: this.createLogId(),
        item_id: item._id,
        operator_id: user._id,
        action_type: 'CREATE',
        commit_summary: validated.commitSummary,
        version_before: 0,
        version_after: 1,
        created_at: now,
      })
      return toPublicItem(item)
    })
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

function validateCreateInput(input: CreateItemInput): CreateItemInput {
  const name = input.name.trim()
  if (name.length < 1 || name.length > 100) {
    throw new ApiException(
      'INVALID_ITEM_NAME',
      '物品名称长度应为 1 至 100 个字符',
    )
  }

  const description = input.description.trim()
  if (description.length > 2000) {
    throw new ApiException(
      'INVALID_ITEM_DESCRIPTION',
      '物品详情不能超过 2000 个字符',
    )
  }

  if (
    input.images.length > 2 ||
    input.images.some(
      (fileId) =>
        typeof fileId !== 'string' ||
        !fileId.trim().startsWith('cloud://') ||
        fileId.length > 1024,
    )
  ) {
    throw new ApiException(
      'INVALID_ITEM_IMAGES',
      '物品图片必须是最多两个有效的云文件 ID',
    )
  }

  if (
    input.quantityMode === 'SINGLE' &&
    input.quantity !== 1
  ) {
    throw new ApiException(
      'INVALID_ITEM_QUANTITY',
      '单件物品的数量必须为 1',
    )
  }
  if (
    input.quantityMode === 'MULTIPLE' &&
    (!Number.isSafeInteger(input.quantity) || input.quantity < 1)
  ) {
    throw new ApiException(
      'INVALID_ITEM_QUANTITY',
      '多件物品的数量必须是正整数',
    )
  }

  const categoryId = input.categoryId.trim()
  if (!categoryId) {
    throw new ApiException('INVALID_CATEGORY_ID', '必须选择物品分类')
  }

  const commitSummary = input.commitSummary.trim()
  if (commitSummary.length < 5 || commitSummary.length > 100) {
    throw new ApiException(
      'INVALID_COMMIT_SUMMARY',
      '提交梗概长度应为 5 至 100 个字符',
    )
  }

  return {
    name,
    images: input.images.map((fileId) => fileId.trim()),
    description,
    quantityMode: input.quantityMode,
    quantity: input.quantity,
    categoryId,
    commitSummary,
  }
}

function toPublicItem(item: ItemRecord): PublicItem {
  return {
    id: item._id,
    code: item.code,
    name: item.name,
    images: item.images,
    description: item.description,
    quantityMode: item.quantity_mode,
    quantity: item.quantity,
    categoryId: item.category_id,
    status: item.status,
    version: item.version,
    registeredBy: item.registered_by,
    registeredAt: item.registered_at,
    updatedBy: item.updated_by,
    updatedAt: item.updated_at,
  }
}
