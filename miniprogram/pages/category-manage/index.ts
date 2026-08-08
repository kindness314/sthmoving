import {
  createCategory,
  deleteCategory,
  listManageableCategories,
  renameCategory,
  setCategoryStatus,
} from '../../services/categories'
import type { TextEntryModalInstance } from '../../components/text-entry-modal/types'
import type { Category } from '../../types/domain'

Page({
  data: {
    categories: [] as Category[],
    categoryName: '',
    loading: true,
    creating: false,
    processingId: '',
    errorMessage: '',
  },

  onShow() {
    void this.loadCategories()
  },

  onPullDownRefresh() {
    void this.loadCategories().finally(() => wx.stopPullDownRefresh())
  },

  async loadCategories() {
    this.setData({ loading: true, errorMessage: '' })
    try {
      this.setData({ categories: await listManageableCategories() })
    } catch (error) {
      this.setData({
        errorMessage:
          error instanceof Error ? error.message : '加载分类失败',
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  handleNameInput(event: WechatMiniprogram.Input) {
    this.setData({
      categoryName: event.detail.value,
      errorMessage: '',
    })
  },

  async handleCreate() {
    if (this.data.creating) {
      return
    }
    this.setData({ creating: true, errorMessage: '' })
    try {
      await createCategory(this.data.categoryName)
      this.setData({ categoryName: '' })
      await wx.showToast({ title: '分类已创建', icon: 'success' })
      await this.loadCategories()
    } catch (error) {
      this.setData({
        errorMessage:
          error instanceof Error ? error.message : '创建分类失败',
      })
    } finally {
      this.setData({ creating: false })
    }
  },

  async handleRename(event: WechatMiniprogram.BaseEvent) {
    const categoryId = event.currentTarget.dataset['id'] as
      | string
      | undefined
    const category = this.data.categories.find(
      (item) => item.id === categoryId,
    )
    if (!category || category.isPreset || this.data.processingId) {
      return
    }

    const modal = this.selectComponent(
      '#text-entry-modal',
    ) as unknown as TextEntryModalInstance | null
    if (!modal) {
      return
    }
    const name = await modal.open({
      title: '重命名分类',
      value: category.name,
      placeholder: '输入新的分类名称',
      confirmText: '保存',
      confirmColor: '#0f766e',
      maxLength: 40,
    })
    if (name === null) {
      return
    }
    await this.runCategoryOperation(
      category.id,
      () => renameCategory(category.id, name),
      '分类已重命名',
    )
  },

  async handleToggleStatus(event: WechatMiniprogram.BaseEvent) {
    const categoryId = event.currentTarget.dataset['id'] as
      | string
      | undefined
    const category = this.data.categories.find(
      (item) => item.id === categoryId,
    )
    if (!category || category.isPreset || this.data.processingId) {
      return
    }

    const disabling = category.status === 'ACTIVE'
    const result = await wx.showModal({
      title: disabling ? '停用分类' : '启用分类',
      content: disabling
        ? '停用后，新登记和查询筛选将不再显示该分类，历史物品不受影响。'
        : '启用后，该分类会重新出现在登记和查询筛选中。',
      confirmText: disabling ? '停用' : '启用',
      confirmColor: disabling ? '#b45309' : '#0f766e',
    })
    if (!result.confirm) {
      return
    }
    await this.runCategoryOperation(
      category.id,
      () =>
        setCategoryStatus(
          category.id,
          disabling ? 'DISABLED' : 'ACTIVE',
        ),
      disabling ? '分类已停用' : '分类已启用',
    )
  },

  async handleDelete(event: WechatMiniprogram.BaseEvent) {
    const categoryId = event.currentTarget.dataset['id'] as
      | string
      | undefined
    const category = this.data.categories.find(
      (item) => item.id === categoryId,
    )
    if (!category || category.isPreset || this.data.processingId) {
      return
    }

    const result = await wx.showModal({
      title: '删除分类',
      content:
        `确定永久删除“${category.name}”吗？` +
        '已被物品使用的分类不能删除，只能停用。',
      confirmText: '删除',
      confirmColor: '#b91c1c',
    })
    if (!result.confirm) {
      return
    }
    await this.runCategoryOperation(
      category.id,
      () => deleteCategory(category.id),
      '分类已删除',
    )
  },

  async runCategoryOperation(
    categoryId: string,
    operation: () => Promise<unknown>,
    successMessage: string,
  ) {
    this.setData({ processingId: categoryId, errorMessage: '' })
    try {
      await operation()
      await wx.showToast({ title: successMessage, icon: 'success' })
      await this.loadCategories()
    } catch (error) {
      this.setData({
        errorMessage:
          error instanceof Error ? error.message : '分类操作失败',
      })
    } finally {
      this.setData({ processingId: '' })
    }
  },
})
