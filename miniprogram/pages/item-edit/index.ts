import { ApiClientError } from '../../services/cloud-api'
import {
  MAX_ITEM_IMAGES,
  validateCommitSummary,
  validateImageCount,
  validateItemDescription,
  validateItemName,
  validateQuantity,
} from '../../domain/validation'
import {
  chooseAndPrepareItemImages,
  deleteUploadedItemImages,
  type PreparedItemImage,
  uploadItemImages,
} from '../../services/item-images'
import {
  getItemDetail,
  updateItem,
} from '../../services/items'
import { listManageableCategories } from '../../services/categories'
import type {
  Category,
  ItemDetail,
  QuantityMode,
} from '../../types/domain'

interface EditImage extends PreparedItemImage {
  fileId?: string
}

interface DraftFields {
  name: string
  description: string
  quantityMode: QuantityMode
  quantity: number
  imageCount: number
  imageKey: string
  categoryId: string
  categoryName: string
}

type ConflictFieldKey =
  | 'name'
  | 'description'
  | 'images'
  | 'quantity'
  | 'category'

interface ConflictField {
  key: ConflictFieldKey
  label: string
  localText: string
  latestText: string
  localChanged: boolean
  latestChanged: boolean
  choice: 'LOCAL' | 'LATEST'
}

interface ConflictState {
  latest: ItemDetail
  local: DraftFields
  localImages: EditImage[]
  fields: ConflictField[]
}

Page({
  data: {
    itemId: '',
    item: null as ItemDetail | null,
    name: '',
    description: '',
    quantityMode: 'SINGLE' as QuantityMode,
    quantityInput: '1',
    commitSummary: '',
    categories: [] as Category[],
    categoryNames: [] as string[],
    categoryIndex: -1,
    selectedCategoryId: '',
    canEditCategory: false,
    loadingCategories: false,
    selectedImages: [] as EditImage[],
    baseVersion: 0,
    baseFields: null as DraftFields | null,
    baseImageFileIds: [] as string[],
    loading: true,
    processingImages: false,
    submitting: false,
    errorMessage: '',
    conflict: null as ConflictState | null,
  },

  onLoad(options: Record<string, string | undefined>) {
    const itemId = safeDecode(options['itemId'])
    this.setData({ itemId })
    if (!itemId) {
      this.setData({
        loading: false,
        errorMessage: '物品链接无效',
      })
      return
    }
    const role = getApp<IAppOption>().globalData.currentUser?.role
    const canEditCategory =
      role === 'ADMIN' || role === 'MANAGER' || role === 'OWNER'
    this.setData({ canEditCategory })
    void this.loadItem()
    if (canEditCategory) {
      void this.loadCategories()
    }
  },

  async loadCategories() {
    this.setData({ loadingCategories: true })
    try {
      const categories = await listManageableCategories()
      const categoryIndex = categories.findIndex(
        (category) => category.id === this.data.selectedCategoryId,
      )
      this.setData({
        categories,
        categoryNames: categories.map((category) =>
          category.status === 'ACTIVE'
            ? category.name
            : `${category.name}（已停用）`,
        ),
        categoryIndex,
      })
    } catch (error) {
      this.setData({
        errorMessage: getErrorMessage(error, '加载分类失败'),
      })
    } finally {
      this.setData({ loadingCategories: false })
    }
  },

  handleCategoryChange(event: WechatMiniprogram.PickerChange) {
    const categoryIndex = Number(event.detail.value)
    const category = this.data.categories[categoryIndex]
    if (!category) {
      return
    }
    this.setData({
      categoryIndex,
      selectedCategoryId: category.id,
      errorMessage: '',
    })
  },

  handleNameInput(event: WechatMiniprogram.Input) {
    this.setData({ name: event.detail.value, errorMessage: '' })
  },

  handleDescriptionInput(event: WechatMiniprogram.TextareaInput) {
    this.setData({ description: event.detail.value, errorMessage: '' })
  },

  handleQuantityModeChange(
    event: WechatMiniprogram.RadioGroupChange,
  ) {
    const quantityMode = event.detail.value as QuantityMode
    this.setData({
      quantityMode,
      quantityInput:
        quantityMode === 'SINGLE' ? '1' : this.data.quantityInput,
      errorMessage: '',
    })
  },

  handleQuantityInput(event: WechatMiniprogram.Input) {
    this.setData({ quantityInput: event.detail.value, errorMessage: '' })
  },

  handleCommitSummaryInput(event: WechatMiniprogram.TextareaInput) {
    this.setData({ commitSummary: event.detail.value, errorMessage: '' })
  },

  async handleChooseImages() {
    if (this.data.processingImages || this.data.submitting) {
      return
    }
    const remaining = MAX_ITEM_IMAGES - this.data.selectedImages.length
    if (remaining < 1) {
      await wx.showToast({ title: '最多选择两张图片', icon: 'none' })
      return
    }

    this.setData({ processingImages: true, errorMessage: '' })
    try {
      const images = await chooseAndPrepareItemImages(remaining)
      this.setData({
        selectedImages: [...this.data.selectedImages, ...images],
      })
    } catch (error) {
      if (!isUserCancellation(error)) {
        this.setData({
          errorMessage: getErrorMessage(error, '图片处理失败'),
        })
      }
    } finally {
      this.setData({ processingImages: false })
    }
  },

  handleRemoveImage(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset['index'])
    this.setData({
      selectedImages: this.data.selectedImages.filter(
        (_image, imageIndex) => imageIndex !== index,
      ),
      errorMessage: '',
    })
  },

  handlePreviewImage(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset['index'])
    const urls = this.data.selectedImages.map(
      (image) => image.tempFilePath,
    )
    const current = urls[index]
    if (current) {
      void wx.previewImage({ current, urls })
    }
  },

  async handleSubmit() {
    if (this.data.submitting || !this.data.item) {
      return
    }
    if (this.data.item.status === 'OFF_SHELF') {
      this.setData({ errorMessage: '已离库物品不能继续编辑' })
      return
    }
    const quantity = Number(this.data.quantityInput)
    const validationError = this.getValidationError(quantity)
    if (validationError) {
      this.setData({ errorMessage: validationError })
      return
    }

    const newImages = this.data.selectedImages.filter(
      (image) => !image.fileId,
    )
    let uploadedFileIds: string[] = []
    let updateSucceeded = false
    this.setData({ submitting: true, errorMessage: '' })
    try {
      uploadedFileIds = await uploadItemImages(newImages)
      const imageFileIds = toImageFileIds(
        this.data.selectedImages,
        uploadedFileIds,
      )
      await updateItem({
        itemId: this.data.itemId,
        expectedVersion: this.data.baseVersion,
        name: this.data.name,
        images: imageFileIds,
        description: this.data.description,
        quantityMode: this.data.quantityMode,
        quantity,
        ...(this.data.canEditCategory &&
        this.data.selectedCategoryId &&
        this.data.selectedCategoryId !== this.data.item.category.id
          ? { categoryId: this.data.selectedCategoryId }
          : {}),
        commitSummary: this.data.commitSummary,
      })
      updateSucceeded = true
      await deleteRemovedImages(this.data.baseImageFileIds, imageFileIds)
      await wx.showToast({ title: '保存成功', icon: 'success' })
      await wx.redirectTo({
        url:
          `/pages/item-detail/index?id=` +
          encodeURIComponent(this.data.itemId),
      })
    } catch (error) {
      if (!updateSucceeded) {
        await deleteUploadedItemImages(uploadedFileIds)
      }
      if (isVersionConflict(error)) {
        await this.showConflict()
      } else {
        this.setData({
          errorMessage: getErrorMessage(error, '保存物品失败'),
        })
      }
    } finally {
      this.setData({ submitting: false })
    }
  },

  getValidationError(quantity: number): string | null {
    return (
      validateItemName(this.data.name) ??
      validateItemDescription(this.data.description) ??
      validateImageCount(
        this.data.selectedImages.map(({ tempFilePath }) => tempFilePath),
      ) ??
      validateQuantity(this.data.quantityMode, quantity) ??
      validateCommitSummary(this.data.commitSummary)
    )
  },

  handleConflictChoice(event: WechatMiniprogram.BaseEvent) {
    const field = event.currentTarget.dataset['field'] as
      | ConflictFieldKey
      | undefined
    const choice = event.currentTarget.dataset['choice'] as
      | 'LOCAL'
      | 'LATEST'
      | undefined
    if (!field || !choice || !this.data.conflict) {
      return
    }
    if (choice === 'LATEST') {
      this.applyLatestField(field)
    } else {
      this.applyLocalField(field)
    }
    this.setData({
      conflict: {
        ...this.data.conflict,
        fields: this.data.conflict.fields.map((entry) =>
          entry.key === field ? { ...entry, choice } : entry,
        ),
      },
    })
  },

  handleAcceptConflict() {
    const conflict = this.data.conflict
    if (!conflict) {
      return
    }
    this.setData({
      baseVersion: conflict.latest.version,
      baseFields: toDraftFields(conflict.latest),
      baseImageFileIds: conflict.latest.imageFileIds,
      conflict: null,
      errorMessage: '已切换到最新版基线，请确认当前内容后再次提交',
    })
  },

  async loadItem() {
    if (!this.data.itemId) {
      return
    }
    this.setData({ loading: true, errorMessage: '' })
    try {
      const item = await getItemDetail(this.data.itemId)
      this.applyItem(item)
    } catch (error) {
      this.setData({
        item: null,
        errorMessage: getErrorMessage(error, '加载物品失败'),
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  async showConflict() {
    try {
      const latest = await getItemDetail(this.data.itemId)
      const local = this.getDraftFields()
      const base = this.data.baseFields ?? local
      this.setData({
        conflict: {
          latest,
          local,
          localImages: [...this.data.selectedImages],
          fields: buildConflictFields(base, local, latest),
        },
        errorMessage: '物品已被其他成员更新，请处理冲突后再提交',
      })
    } catch (error) {
      this.setData({
        errorMessage: getErrorMessage(
          error,
          '物品已被其他成员更新，请重新加载最新版',
        ),
      })
    }
  },

  applyLatestField(field: ConflictFieldKey) {
    const latest = this.data.conflict?.latest
    if (!latest) {
      return
    }
    if (field === 'name') {
      this.setData({ name: latest.name })
    } else if (field === 'description') {
      this.setData({ description: latest.description })
    } else if (field === 'quantity') {
      this.setData({
        quantityMode: latest.quantityMode,
        quantityInput: String(latest.quantity),
      })
    } else if (field === 'category') {
      this.applyCategorySelection(latest.category.id)
    } else {
      this.setData({ selectedImages: toEditImages(latest) })
    }
  },

  applyLocalField(field: ConflictFieldKey) {
    const conflict = this.data.conflict
    if (!conflict) {
      return
    }
    if (field === 'name') {
      this.setData({ name: conflict.local.name })
    } else if (field === 'description') {
      this.setData({ description: conflict.local.description })
    } else if (field === 'quantity') {
      this.setData({
        quantityMode: conflict.local.quantityMode,
        quantityInput: String(conflict.local.quantity),
      })
    } else if (field === 'category') {
      this.applyCategorySelection(conflict.local.categoryId)
    } else {
      this.setData({ selectedImages: [...conflict.localImages] })
    }
  },

  applyItem(item: ItemDetail) {
    this.setData({
      item,
      name: item.name,
      description: item.description,
      quantityMode: item.quantityMode,
      quantityInput: String(item.quantity),
      selectedImages: toEditImages(item),
      selectedCategoryId: item.category.id,
      categoryIndex: this.data.categories.findIndex(
        (category) => category.id === item.category.id,
      ),
      baseVersion: item.version,
      baseFields: toDraftFields(item),
      baseImageFileIds: [...item.imageFileIds],
      conflict: null,
      errorMessage: '',
    })
  },

  getDraftFields(): DraftFields {
    return {
      name: this.data.name.trim(),
      description: this.data.description.trim(),
      quantityMode: this.data.quantityMode,
      quantity: Number(this.data.quantityInput),
      imageCount: this.data.selectedImages.length,
      imageKey: this.data.selectedImages
        .map((image) => image.fileId ?? image.tempFilePath)
        .join('\u0000'),
      categoryId: this.data.selectedCategoryId,
      categoryName:
        this.data.categoryIndex >= 0
          ? this.data.categoryNames[this.data.categoryIndex] ?? ''
          : '',
    }
  },

  applyCategorySelection(categoryId: string) {
    const categoryIndex = this.data.categories.findIndex(
      (category) => category.id === categoryId,
    )
    this.setData({
      selectedCategoryId: categoryId,
      categoryIndex,
    })
  },
})

function toImageFileIds(
  images: readonly EditImage[],
  uploadedFileIds: readonly string[],
): string[] {
  let uploadedIndex = 0
  return images.map((image) => {
    if (image.fileId) {
      return image.fileId
    }
    const fileId = uploadedFileIds[uploadedIndex]
    uploadedIndex += 1
    if (!fileId) {
      throw new Error('图片上传结果缺少文件 ID')
    }
    return fileId
  })
}

async function deleteRemovedImages(
  previousFileIds: readonly string[],
  currentFileIds: readonly string[],
): Promise<void> {
  const current = new Set(currentFileIds)
  const removed = previousFileIds.filter((fileId) => !current.has(fileId))
  await deleteUploadedItemImages(removed)
}

function toEditImages(item: ItemDetail): EditImage[] {
  return item.images.map((image, index) => {
    const fileId = item.imageFileIds[index]
    return {
      tempFilePath: image,
      size: 0,
      ...(fileId ? { fileId } : {}),
    }
  })
}

function toDraftFields(item: ItemDetail): DraftFields {
  return {
    name: item.name,
    description: item.description,
    quantityMode: item.quantityMode,
    quantity: item.quantity,
    imageCount: item.images.length,
    imageKey: item.imageFileIds.join('\u0000'),
    categoryId: item.category.id,
    categoryName: item.category.name,
  }
}

function buildConflictFields(
  base: DraftFields,
  local: DraftFields,
  latest: ItemDetail,
): ConflictField[] {
  const fields: Array<{
    key: ConflictFieldKey
    label: string
    localText: string
    latestText: string
    localValue: string | number
    latestValue: string | number
    baseValue: string | number
  }> = [
    {
      key: 'name',
      label: '物品名称',
      localText: local.name || '（空）',
      latestText: latest.name || '（空）',
      localValue: local.name,
      latestValue: latest.name,
      baseValue: base.name,
    },
    {
      key: 'description',
      label: '物品详情',
      localText: local.description || '（空）',
      latestText: latest.description || '（空）',
      localValue: local.description,
      latestValue: latest.description,
      baseValue: base.description,
    },
    {
      key: 'images',
      label: '物品图片',
      localText: `${local.imageCount} 张`,
      latestText: `${latest.images.length} 张`,
      localValue: local.imageKey,
      latestValue: latest.imageFileIds.join('\u0000'),
      baseValue: base.imageKey,
    },
    {
      key: 'quantity',
      label: '数量',
      localText: formatQuantity(local.quantityMode, local.quantity),
      latestText: formatQuantity(latest.quantityMode, latest.quantity),
      localValue: `${local.quantityMode}:${local.quantity}`,
      latestValue: `${latest.quantityMode}:${latest.quantity}`,
      baseValue: `${base.quantityMode}:${base.quantity}`,
    },
    {
      key: 'category',
      label: '物品分类',
      localText: local.categoryName || '（未选择）',
      latestText: latest.category.name || '（未选择）',
      localValue: local.categoryId,
      latestValue: latest.category.id,
      baseValue: base.categoryId,
    },
  ]
  return fields
    .filter(
      (field) =>
        field.localValue !== field.latestValue ||
        field.localValue !== field.baseValue,
    )
    .map((field) => ({
      key: field.key,
      label: field.label,
      localText: field.localText,
      latestText: field.latestText,
      localChanged: field.localValue !== field.baseValue,
      latestChanged: field.latestValue !== field.baseValue,
      choice: 'LOCAL',
    }))
}

function formatQuantity(mode: QuantityMode, quantity: number): string {
  return mode === 'SINGLE' ? '单件（1 件）' : `多件（${quantity} 件）`
}

function safeDecode(value: string | undefined): string {
  if (!value) {
    return ''
  }
  try {
    return decodeURIComponent(value)
  } catch {
    return ''
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'errMsg' in error &&
    typeof error.errMsg === 'string'
  ) {
    return error.errMsg
  }
  return fallback
}

function isUserCancellation(error: unknown): boolean {
  return getErrorMessage(error, '').toLowerCase().includes('cancel')
}

function isVersionConflict(error: unknown): boolean {
  return error instanceof ApiClientError && error.code === 'VERSION_CONFLICT'
}
