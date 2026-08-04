import {
  generateItemMiniProgramCode,
  getItemLabel,
} from '../../services/labels'
import { getItemDetail } from '../../services/items'
import type { ItemDetail, ItemLabel } from '../../types/domain'

Page({
  data: {
    itemId: '',
    item: null as ItemDetail | null,
    label: null as ItemLabel | null,
    labelImageUrl: '',
    loading: true,
    generating: false,
    errorMessage: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    const itemId = safeDecode(options['itemId'])
    this.setData({ itemId })
    void this.loadPage()
  },

  onPullDownRefresh() {
    void this.loadPage().finally(() => wx.stopPullDownRefresh())
  },

  handleRetry() {
    void this.generateLabel()
  },

  handlePreview() {
    const imageUrl = this.data.labelImageUrl
    if (!imageUrl) {
      return
    }
    void wx.previewImage({
      current: imageUrl,
      urls: [imageUrl],
    })
  },

  async loadPage() {
    if (!this.data.itemId) {
      this.setData({
        loading: false,
        errorMessage: '物品链接无效',
      })
      return
    }
    this.setData({ loading: true, errorMessage: '' })
    try {
      const [item, label] = await Promise.all([
        getItemDetail(this.data.itemId),
        getItemLabel(this.data.itemId),
      ])
      this.setData({
        item,
        label,
        labelImageUrl: label?.fileUrl ?? '',
      })
      if (!label || label.status === 'PENDING') {
        await this.generateLabel()
      }
    } catch (error) {
      this.setData({
        errorMessage:
          error instanceof Error ? error.message : '加载小程序码失败',
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  async generateLabel() {
    if (!this.data.itemId || this.data.generating) {
      return
    }
    this.setData({ generating: true, errorMessage: '' })
    try {
      const label = await generateItemMiniProgramCode(this.data.itemId)
      this.setData({
        label,
        labelImageUrl: label.fileUrl ?? '',
      })
    } catch (error) {
      this.setData({
        errorMessage:
          error instanceof Error ? error.message : '生成小程序码失败',
      })
    } finally {
      this.setData({ generating: false })
    }
  },
})


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
