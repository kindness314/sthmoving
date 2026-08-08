import { randomBytes, randomUUID } from 'node:crypto'

import {
  normalizeCategoryName,
  validateCategoryName,
} from '../categories/service'
import type { CategoryRecord } from '../categories/types'
import { ApiException } from '../errors'
import { createPendingItemLabel } from '../labels/service'
import type { UserRecord } from '../membership/types'
import type {
  ItemRepository,
  ItemUnitOfWork,
} from './repository'
import type {
  CreateItemInput,
  ItemRecord,
  ListItemsInput,
  PublicItem,
  PublicItemDetail,
  PublicItemList,
  PublicItemOperationLog,
  PublicItemSummary,
  UpdateItemInput,
} from './types'

export type ItemFileUrlResolver = (
  fileIds: string[],
) => Promise<Map<string, string>>

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
    private readonly createCategoryId: () => string = () =>
      `category-${randomUUID()}`,
    private readonly resolveFileUrls: ItemFileUrlResolver = identityFileUrls,
  ) {}

  async create(openid: string, input: CreateItemInput): Promise<PublicItem> {
    const validated = validateCreateInput(input)

    return this.repository.runTransaction(async (unitOfWork) => {
      const user = await unitOfWork.getUserByOpenid(openid)
      requireApprovedUser(user, openid)

      const now = this.now()
      const category = await this.resolveCategory(
        unitOfWork,
        user,
        validated,
        now,
      )
      const item: ItemRecord = {
        _id: this.createItemId(),
        code: this.createPublicCode(),
        name: validated.name,
        images: validated.images,
        description: validated.description,
        quantity_mode: validated.quantityMode,
        quantity: validated.quantity,
        category_id: category._id,
        status: 'ACTIVE',
        version: 1,
        registered_by: user._id,
        registered_at: now,
        updated_by: user._id,
        updated_at: now,
      }

      await unitOfWork.setItem(item)
      await unitOfWork.setLabel(
        createPendingItemLabel(item._id, item.code, now),
      )
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

  async update(
    openid: string,
    input: UpdateItemInput,
  ): Promise<PublicItem> {
    const validated = validateUpdateInput(input)

    return this.repository.runTransaction(async (unitOfWork) => {
      const user = await unitOfWork.getUserByOpenid(openid)
      requireApprovedUser(user, openid)

      const item = await unitOfWork.getItem(validated.itemId)
      if (!item) {
        throw new ApiException('ITEM_NOT_FOUND', '未找到物品')
      }
      if (item.status === 'OFF_SHELF') {
        throw new ApiException(
          'ITEM_NOT_EDITABLE',
          '已离库物品不能继续编辑',
        )
      }
      if (item.version !== validated.expectedVersion) {
        throw new ApiException(
          'VERSION_CONFLICT',
          '物品已被其他成员更新，请基于最新版本重新提交',
          {
            latestVersion: item.version,
            latestItem: toPublicItem(item),
          },
        )
      }

      const quantityMode = validated.quantityMode ?? item.quantity_mode
      const quantity = validated.quantity ?? item.quantity
      validateQuantity(quantityMode, quantity)
      let category = await unitOfWork.getCategory(item.category_id)
      if (!category) {
        throw new ApiException('ITEM_DATA_INVALID', '物品关联的分类不存在')
      }
      let categoryChanged = false
      if (validated.categoryId !== undefined) {
        requireCategoryManager(user)
        const selectedCategory = await unitOfWork.getCategory(
          validated.categoryId,
        )
        if (!selectedCategory) {
          throw new ApiException('CATEGORY_NOT_FOUND', '分类不存在')
        }
        categoryChanged = selectedCategory._id !== item.category_id
        if (categoryChanged && selectedCategory.status !== 'ACTIVE') {
          throw new ApiException(
            'CATEGORY_DISABLED',
            '该分类已停用，不能用于更新物品分类',
          )
        }
        category = selectedCategory
      }
      const hasEffectiveChange =
        (validated.name !== undefined && validated.name !== item.name) ||
        (validated.images !== undefined &&
          !sameStringArray(validated.images, item.images)) ||
        (validated.description !== undefined &&
          validated.description !== item.description) ||
        quantityMode !== item.quantity_mode ||
        quantity !== item.quantity ||
        categoryChanged
      if (!hasEffectiveChange) {
        throw new ApiException('NO_ITEM_CHANGES', '至少修改一个物品字段')
      }

      const now = this.now()
      const updated: ItemRecord = {
        ...item,
        ...(validated.name !== undefined
          ? { name: validated.name }
          : {}),
        ...(validated.images !== undefined
          ? { images: validated.images }
          : {}),
        ...(validated.description !== undefined
          ? { description: validated.description }
          : {}),
        quantity_mode: quantityMode,
        quantity,
        ...(categoryChanged ? { category_id: category._id } : {}),
        version: item.version + 1,
        updated_by: user._id,
        updated_at: now,
      }

      if (categoryChanged) {
        await unitOfWork.setCategory({
          ...category,
          item_reference_count: (category.item_reference_count ?? 0) + 1,
        })
      }
      await unitOfWork.setItem(updated)
      await unitOfWork.setOperationLog({
        _id: this.createLogId(),
        item_id: updated._id,
        operator_id: user._id,
        action_type: 'UPDATE',
        commit_summary: validated.commitSummary,
        version_before: item.version,
        version_after: updated.version,
        created_at: now,
      })
      return toPublicItem(updated)
    })
  }

  async list(
    openid: string,
    input: ListItemsInput,
  ): Promise<PublicItemList> {
    const user = await this.repository.getUserByOpenid(openid)
    requireApprovedUser(user, openid)
    if (
      input.status === 'OFF_SHELF' &&
      user.role !== 'ADMIN' &&
      user.role !== 'MANAGER' &&
      user.role !== 'OWNER'
    ) {
      throw new ApiException(
        'FORBIDDEN',
        '只有管理员或所有者可以查看已离库物品',
      )
    }
    const query = validateListInput(input)
    if (query.categoryId) {
      const category = await this.repository.getCategory(query.categoryId)
      if (!category) {
        throw new ApiException('CATEGORY_NOT_FOUND', '分类不存在')
      }
      if (category.status !== 'ACTIVE') {
        throw new ApiException(
          'CATEGORY_DISABLED',
          '该分类已停用，不能用于查询筛选',
        )
      }
    }

    const records = await this.repository.listItems({
      ...query,
      limit: query.limit + 1,
    })
    const hasMore = records.length > query.limit
    const page = records.slice(0, query.limit)
    const items = await this.toPublicSummaries(page)
    const last = page[page.length - 1]
    return {
      items,
      ...(hasMore && last
        ? {
            nextCursor: {
              updatedAt: last.updated_at,
              id: last._id,
            },
          }
        : {}),
    }
  }

  async detail(
    openid: string,
    itemIdInput: string,
  ): Promise<PublicItemDetail> {
    const user = await this.repository.getUserByOpenid(openid)
    requireApprovedUser(user, openid)
    const itemId = itemIdInput.trim()
    if (!itemId || itemId.length > 100) {
      throw new ApiException('INVALID_ITEM_ID', '物品 ID 无效')
    }
    const item = await this.repository.getItem(itemId)
    if (!item) {
      throw new ApiException('ITEM_NOT_FOUND', '未找到物品')
    }
    if (
      item.status === 'OFF_SHELF' &&
      user.role !== 'ADMIN' &&
      user.role !== 'MANAGER' &&
      user.role !== 'OWNER'
    ) {
      throw new ApiException('ITEM_OFF_SHELF', '物品已离库，请在离库物品管理中查看')
    }
    const [summary] = await this.toPublicSummaries([item])
    const users = await this.repository.getUsersByIds([
      item.registered_by,
      item.updated_by,
    ])
    const usersById = new Map(users.map((user) => [user._id, user]))
    const registeredBy = usersById.get(item.registered_by)
    const updatedBy = usersById.get(item.updated_by)
    if (!summary || !registeredBy || !updatedBy) {
      throw new ApiException(
        'ITEM_DATA_INVALID',
        '物品关联的分类或用户不存在',
      )
    }
    return {
      ...summary,
      imageFileIds: item.images,
      version: item.version,
      registeredBy: {
        id: registeredBy._id,
        displayName: registeredBy.display_name,
      },
      registeredAt: item.registered_at,
      updatedBy: {
        id: updatedBy._id,
        displayName: updatedBy.display_name,
      },
    }
  }

  async logs(
    openid: string,
    itemIdInput: string,
  ): Promise<PublicItemOperationLog[]> {
    const user = await this.repository.getUserByOpenid(openid)
    requireApprovedUser(user, openid)
    const itemId = itemIdInput.trim()
    if (!itemId || itemId.length > 100) {
      throw new ApiException('INVALID_ITEM_ID', '物品 ID 无效')
    }
    const item = await this.repository.getItem(itemId)
    if (!item) {
      throw new ApiException('ITEM_NOT_FOUND', '未找到物品')
    }
    if (
      item.status === 'OFF_SHELF' &&
      user.role !== 'ADMIN' &&
      user.role !== 'MANAGER' &&
      user.role !== 'OWNER'
    ) {
      throw new ApiException('ITEM_OFF_SHELF', '物品已离库，请在离库物品管理中查看')
    }
    const records = await this.repository.listOperationLogs(itemId)
    const users = await this.repository.getUsersByIds(
      records.map((record) => record.operator_id),
    )
    const usersById = new Map(users.map((user) => [user._id, user]))
    return records.map((record) => {
      const operator = usersById.get(record.operator_id)
      if (!operator) {
        throw new ApiException(
          'ITEM_DATA_INVALID',
          '物品操作日志关联的用户不存在',
        )
      }
      return {
        id: record._id,
        itemId: record.item_id,
        action: record.action_type,
        summary: record.commit_summary,
        operator: {
          id: operator._id,
          displayName: operator.display_name,
        },
        operatedAt: record.created_at,
        itemVersion: record.version_after,
      }
    })
  }

  private async resolveCategory(
    unitOfWork: ItemUnitOfWork,
    user: UserRecord,
    input: CreateItemInput,
    now: string,
  ): Promise<CategoryRecord> {
    if (input.categoryId) {
      const category = await unitOfWork.getCategory(input.categoryId)
      if (!category) {
        throw new ApiException('CATEGORY_NOT_FOUND', '分类不存在')
      }
      if (category.status !== 'ACTIVE') {
        throw new ApiException(
          'CATEGORY_DISABLED',
          '该分类已停用，不能用于登记物品',
        )
      }
      const referenced = {
        ...category,
        item_reference_count:
          (category.item_reference_count ?? 0) + 1,
      }
      await unitOfWork.setCategory(referenced)
      return referenced
    }

    if (!input.newCategoryName) {
      throw new ApiException(
        'INVALID_CATEGORY_SELECTION',
        '必须选择已有分类或填写一个新分类',
      )
    }
    const name = validateCategoryName(input.newCategoryName)
    const normalizedName = normalizeCategoryName(name)
    if (await unitOfWork.getCategoryByNormalizedName(normalizedName)) {
      throw new ApiException('CATEGORY_NAME_EXISTS', '已存在同名分类')
    }
    const category: CategoryRecord = {
      _id: this.createCategoryId(),
      name,
      normalized_name: normalizedName,
      status: 'ACTIVE',
      is_preset: false,
      sort_order: 1000,
      item_reference_count: 1,
      created_by: user._id,
      created_at: now,
      updated_at: now,
    }
    await unitOfWork.setCategory(category)
    return category
  }

  private async toPublicSummaries(
    items: ItemRecord[],
  ): Promise<PublicItemSummary[]> {
    const fileUrls = await this.resolveFileUrls(
      items.flatMap((item) => item.images),
    )
    const categories = await this.repository.getCategoriesByIds(
      items.map((item) => item.category_id),
    )
    const categoriesById = new Map(
      categories.map((category) => [category._id, category]),
    )
    return items.map((item) => {
      const category = categoriesById.get(item.category_id)
      if (!category) {
        throw new ApiException(
          'ITEM_DATA_INVALID',
          '物品关联的分类不存在',
        )
      }
      return {
        id: item._id,
        code: item.code,
        name: item.name,
        images: item.images.map(
          (fileId) => fileUrls.get(fileId) ?? fileId,
        ),
        description: item.description,
        quantityMode: item.quantity_mode,
        quantity: item.quantity,
        category: {
          id: category._id,
          name: category.name,
          status: category.status,
        },
        status: item.status,
        version: item.version,
        updatedAt: item.updated_at,
      }
    })
  }
}

async function identityFileUrls(
  fileIds: string[],
): Promise<Map<string, string>> {
  return new Map(fileIds.map((fileId) => [fileId, fileId]))
}

function validateListInput(input: ListItemsInput) {
  const keyword = input.keyword?.trim()
  if (keyword && keyword.length > 100) {
    throw new ApiException(
      'INVALID_SEARCH_KEYWORD',
      '搜索关键词不能超过 100 个字符',
    )
  }
  const categoryId = input.categoryId?.trim()
  if (input.categoryId !== undefined && !categoryId) {
    throw new ApiException('INVALID_CATEGORY_ID', '分类 ID 无效')
  }
  if (
    input.status !== undefined &&
    input.status !== 'ACTIVE' &&
    input.status !== 'OUTBOUND_PENDING' &&
    input.status !== 'OFF_SHELF'
  ) {
    throw new ApiException('INVALID_ITEM_STATUS', '物品状态筛选无效')
  }
  const limit = input.limit ?? 10
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
    throw new ApiException(
      'INVALID_PAGE_SIZE',
      '每页数量应为 1 至 20',
    )
  }
  const cursor = input.cursor
  if (
    cursor &&
    (!cursor.id.trim() ||
      cursor.id.length > 100 ||
      !isIsoDate(cursor.updatedAt))
  ) {
    throw new ApiException('INVALID_CURSOR', '分页游标无效')
  }
  return {
    ...(keyword ? { keyword } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(cursor
      ? {
          cursor: {
            id: cursor.id.trim(),
            updatedAt: cursor.updatedAt,
          },
        }
      : {}),
    limit,
  }
}

function isIsoDate(value: string): boolean {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
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

function requireCategoryManager(user: UserRecord): void {
  if (
    user.role !== 'ADMIN' &&
    user.role !== 'MANAGER' &&
    user.role !== 'OWNER'
  ) {
    throw new ApiException(
      'FORBIDDEN',
      '只有管理员或所有者可以调整物品分类',
    )
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

  const categoryId = input.categoryId?.trim()
  const newCategoryName = input.newCategoryName?.trim()
  if (Boolean(categoryId) === Boolean(newCategoryName)) {
    throw new ApiException(
      'INVALID_CATEGORY_SELECTION',
      '必须选择已有分类或填写一个新分类',
    )
  }

  const commitSummary = input.commitSummary.trim()
  if (commitSummary.length < 1 || commitSummary.length > 250) {
    throw new ApiException(
      'INVALID_COMMIT_SUMMARY',
      '提交梗概不能为空且不能超过 250 个字符',
    )
  }

  const validated: CreateItemInput = {
    name,
    images: input.images.map((fileId) => fileId.trim()),
    description,
    quantityMode: input.quantityMode,
    quantity: input.quantity,
    commitSummary,
  }
  if (categoryId) {
    validated.categoryId = categoryId
  } else if (newCategoryName) {
    validated.newCategoryName = newCategoryName
  }
  return validated
}

function validateUpdateInput(input: UpdateItemInput): UpdateItemInput {
  const itemId = input.itemId.trim()
  if (!itemId || itemId.length > 100) {
    throw new ApiException('INVALID_ITEM_ID', '物品 ID 无效')
  }
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new ApiException('INVALID_VERSION', '物品版本无效')
  }

  const hasChanges =
    input.name !== undefined ||
    input.images !== undefined ||
    input.description !== undefined ||
    input.quantityMode !== undefined ||
    input.quantity !== undefined ||
    input.categoryId !== undefined
  if (!hasChanges) {
    throw new ApiException('NO_ITEM_CHANGES', '至少修改一个物品字段')
  }

  const validated: UpdateItemInput = {
    itemId,
    expectedVersion: input.expectedVersion,
    commitSummary: validateCommitSummary(input.commitSummary),
  }

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length < 1 || name.length > 100) {
      throw new ApiException(
        'INVALID_ITEM_NAME',
        '物品名称长度应为 1 至 100 个字符',
      )
    }
    validated.name = name
  }
  if (input.images !== undefined) {
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
    validated.images = input.images.map((fileId) => fileId.trim())
  }
  if (input.description !== undefined) {
    const description = input.description.trim()
    if (description.length > 2000) {
      throw new ApiException(
        'INVALID_ITEM_DESCRIPTION',
        '物品详情不能超过 2000 个字符',
      )
    }
    validated.description = description
  }
  if (input.quantityMode !== undefined) {
    if (!isQuantityMode(input.quantityMode)) {
      throw new ApiException('INVALID_ITEM_QUANTITY', '物品数量模式无效')
    }
    validated.quantityMode = input.quantityMode
  }
  if (input.quantity !== undefined) {
    if (typeof input.quantity !== 'number' || !Number.isFinite(input.quantity)) {
      throw new ApiException('INVALID_ITEM_QUANTITY', '物品数量无效')
    }
    validated.quantity = input.quantity
  }
  if (input.categoryId !== undefined) {
    const categoryId = input.categoryId.trim()
    if (!categoryId || categoryId.length > 100) {
      throw new ApiException('INVALID_CATEGORY_ID', '分类 ID 无效')
    }
    validated.categoryId = categoryId
  }

  return validated
}

function validateCommitSummary(value: string): string {
  const summary = value.trim()
  if (summary.length < 1 || summary.length > 250) {
    throw new ApiException(
      'INVALID_COMMIT_SUMMARY',
      '提交梗概不能为空且不能超过 250 个字符',
    )
  }
  return summary
}

function validateQuantity(
  quantityMode: ItemRecord['quantity_mode'],
  quantity: number,
): void {
  if (
    quantityMode === 'SINGLE' &&
    quantity !== 1
  ) {
    throw new ApiException(
      'INVALID_ITEM_QUANTITY',
      '单件物品的数量必须为 1',
    )
  }
  if (
    quantityMode === 'MULTIPLE' &&
    (!Number.isSafeInteger(quantity) || quantity < 1)
  ) {
    throw new ApiException(
      'INVALID_ITEM_QUANTITY',
      '多件物品的数量必须是正整数',
    )
  }
}

function isQuantityMode(value: unknown): value is ItemRecord['quantity_mode'] {
  return value === 'SINGLE' || value === 'MULTIPLE'
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
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
