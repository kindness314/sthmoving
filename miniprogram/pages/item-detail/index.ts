import { getItemDetail } from '../../services/items'
import { resolveItemLabel } from '../../services/labels'
import type { ItemDetail } from '../../types/domain'

interface ItemDetailView extends ItemDetail {
  quantityText: string
  statusText: string
  registeredAtText: string
  updatedAtText: string
}

Page({
  data: {
    itemId: '',
    scene: '',
    item: null as ItemDetailView | null,
    loading: true,
    errorMessage: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    const itemId = safeDecode(options['id'])
    const scene = safeDecode(options['scene'])
    this.setData({ itemId, scene })
    if (itemId) {
      void this.loadItem()
      return
    }
    if (scene) {
      void this.resolveScene()
      return
    }
    this.setData({
      loading: false,
      errorMessage: '物品链接无效',
    })
  },

  onPullDownRefresh() {
    void this.loadItem().finally(() => wx.stopPullDownRefresh())
  },

  handleRetry() {
    void this.loadItem()
  },

  handlePreviewImage(event: WechatMiniprogram.BaseEvent) {
    const current = event.currentTarget.dataset['src'] as string | undefined
    const urls = this.data.item?.images ?? []
    if (!current || urls.length === 0) {
      return
    }
    void wx.previewImage({ current, urls })
  },

  handleViewLabel() {
    if (!this.data.itemId) {
      return
    }
    void wx.navigateTo({
      url:
        `/pages/label-preview/index?itemId=` +
        encodeURIComponent(this.data.itemId),
    })
  },

  async resolveScene() {
    this.setData({ loading: true, errorMessage: '' })
    try {
      const result = await resolveItemLabel(this.data.scene)
      this.setData({ itemId: result.itemId })
      await this.loadItem()
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage:
          error instanceof Error ? error.message : '无法识别物品标签',
      })
    }
  },

  async loadItem() {
    if (!this.data.itemId) {
      this.setData({
        loading: false,
        errorMessage: '物品链接无效',
      })
      return
    }
    this.setData({ loading: true, errorMessage: '' })
    try {
      const item = await getItemDetail(this.data.itemId)
      this.setData({ item: toItemDetailView(item) })
    } catch (error) {
      this.setData({
        item: null,
        errorMessage:
          error instanceof Error ? error.message : '加载物品详情失败',
      })
    } finally {
      this.setData({ loading: false })
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

function toItemDetailView(item: ItemDetail): ItemDetailView {
  return {
    ...item,
    quantityText:
      item.quantityMode === 'SINGLE' ? '单件（1 件）' : `${item.quantity} 件`,
    statusText:
      item.status === 'ACTIVE'
        ? '在库'
        : item.status === 'OUTBOUND_PENDING'
          ? '离库申请中'
          : '已离库',
    registeredAtText: formatDateTime(item.registeredAt),
    updatedAtText: formatDateTime(item.updatedAt),
  }
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  const pad = (part: number) => part.toString().padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}
