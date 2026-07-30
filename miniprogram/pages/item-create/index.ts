import {
  MAX_ITEM_IMAGES,
  validateCommitSummary,
  validateImageCount,
  validateItemDescription,
  validateItemName,
  validateQuantity,
} from '../../domain/validation'
import {
  createCategory,
  listCategories,
} from '../../services/categories'
import {
  chooseAndPrepareItemImages,
  deleteUploadedItemImages,
  type PreparedItemImage,
  uploadItemImages,
} from '../../services/item-images'
import { createItem } from '../../services/items'
import type {
  Category,
  QuantityMode,
} from '../../types/domain'

Page({
  data: {
    name: '',
    description: '',
    quantityMode: 'SINGLE' as QuantityMode,
    quantityInput: '1',
    commitSummary: '首次登记物品',
    categories: [] as Category[],
    selectedCategoryIndex: -1,
    selectedCategoryId: '',
    selectedCategoryName: '',
    newCategoryName: '',
    selectedImages: [] as PreparedItemImage[],
    loadingCategories: true,
    creatingCategory: false,
    processingImages: false,
    submitting: false,
    errorMessage: '',
  },

  onLoad() {
    void this.loadCategories()
  },

  async loadCategories(selectedCategoryId?: string) {
    this.setData({ loadingCategories: true, errorMessage: '' })
    try {
      const categories = await listCategories()
      const categoryId =
        selectedCategoryId ?? this.data.selectedCategoryId
      const selectedCategoryIndex = categories.findIndex(
        (category) => category.id === categoryId,
      )
      const selected = categories[selectedCategoryIndex]
      this.setData({
        categories,
        selectedCategoryIndex,
        selectedCategoryId: selected?.id ?? '',
        selectedCategoryName: selected?.name ?? '',
      })
    } catch (error) {
      this.setData({ errorMessage: getErrorMessage(error, '加载分类失败') })
    } finally {
      this.setData({ loadingCategories: false })
    }
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

  handleCategoryChange(event: WechatMiniprogram.PickerChange) {
    const selectedCategoryIndex = Number(event.detail.value)
    const category = this.data.categories[selectedCategoryIndex]
    if (!category) {
      return
    }
    this.setData({
      selectedCategoryIndex,
      selectedCategoryId: category.id,
      selectedCategoryName: category.name,
      errorMessage: '',
    })
  },

  handleNewCategoryInput(event: WechatMiniprogram.Input) {
    this.setData({
      newCategoryName: event.detail.value,
      errorMessage: '',
    })
  },

  async handleCreateCategory() {
    if (this.data.creatingCategory || !this.data.newCategoryName.trim()) {
      return
    }
    this.setData({ creatingCategory: true, errorMessage: '' })
    try {
      const category = await createCategory(this.data.newCategoryName)
      this.setData({ newCategoryName: '' })
      await this.loadCategories(category.id)
      await wx.showToast({ title: '分类已新建并选中', icon: 'success' })
    } catch (error) {
      this.setData({ errorMessage: getErrorMessage(error, '新建分类失败') })
    } finally {
      this.setData({ creatingCategory: false })
    }
  },

  async handleChooseImages() {
    if (this.data.processingImages) {
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
    if (this.data.submitting) {
      return
    }
    const quantity = Number(this.data.quantityInput)
    const validationError = this.getValidationError(quantity)
    if (validationError) {
      this.setData({ errorMessage: validationError })
      return
    }

    let uploadedFileIds: string[] = []
    this.setData({ submitting: true, errorMessage: '' })
    try {
      uploadedFileIds = await uploadItemImages(this.data.selectedImages)
      const item = await createItem({
        name: this.data.name,
        images: uploadedFileIds,
        description: this.data.description,
        quantityMode: this.data.quantityMode,
        quantity,
        categoryId: this.data.selectedCategoryId,
        commitSummary: this.data.commitSummary,
      })
      await wx.showModal({
        title: '登记成功',
        content: `物品编码：${item.code}`,
        showCancel: false,
        confirmText: '返回工作台',
      })
      await wx.navigateBack()
    } catch (error) {
      await deleteUploadedItemImages(uploadedFileIds)
      this.setData({ errorMessage: getErrorMessage(error, '登记物品失败') })
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
      (!this.data.selectedCategoryId ? '请选择物品分类' : null) ??
      validateCommitSummary(this.data.commitSummary)
    )
  },
})

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
