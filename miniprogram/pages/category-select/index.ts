import {
  createCategory,
  listCategories,
} from '../../services/categories'
import type { Category } from '../../types/domain'

Page({
  data: {
    categories: [] as Category[],
    categoryName: '',
    loading: true,
    creating: false,
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
      this.setData({ categories: await listCategories() })
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
    this.setData({ categoryName: event.detail.value })
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
})
