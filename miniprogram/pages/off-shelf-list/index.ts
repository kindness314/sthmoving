import { listItems } from '../../services/items'
import { validateCommitSummary } from '../../domain/validation'
import {
  batchDeleteOutboundItems,
  batchRestoreInbound,
} from '../../services/outbound'
import type { TextEntryModalInstance } from '../../components/text-entry-modal/types'
import type { ItemListCursor, ItemSummary, UserRole } from '../../types/domain'

interface OffShelfItemView extends ItemSummary {
  coverImage: string
  quantityText: string
  updatedAtText: string
  selected: boolean
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
let requestSequence = 0

Page({
  data: {
    keyword: '',
    items: [] as OffShelfItemView[],
    nextCursor: null as ItemListCursor | null,
    loading: true,
    hasLoaded: false,
    loadingMore: false,
    userRole: '' as UserRole | '',
    selectedIds: [] as string[],
    processing: false,
    errorMessage: '',
  },

  onLoad() {
    void this.loadFirstPage()
  },

  onShow() {
    const userRole = getApp<IAppOption>().globalData.currentUser?.role ?? ''
    this.setData({ userRole })
    if (this.data.hasLoaded && !this.data.loading) {
      void this.loadFirstPage()
    }
  },

  onUnload() {
    if (searchTimer) {
      clearTimeout(searchTimer)
      searchTimer = undefined
    }
    requestSequence += 1
  },

  onPullDownRefresh() {
    void this.loadFirstPage().finally(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    void this.loadMore()
  },

  handleKeywordInput(event: WechatMiniprogram.Input) {
    this.setData({ keyword: event.detail.value })
    if (searchTimer) {
      clearTimeout(searchTimer)
    }
    searchTimer = setTimeout(() => {
      searchTimer = undefined
      void this.loadFirstPage()
    }, 400)
  },

  handleSearchConfirm() {
    if (searchTimer) {
      clearTimeout(searchTimer)
      searchTimer = undefined
    }
    void this.loadFirstPage()
  },

  handleRetry() {
    void this.loadFirstPage()
  },

  handleItemTap(event: WechatMiniprogram.BaseEvent) {
    const itemId = event.currentTarget.dataset['id'] as string | undefined
    if (!itemId) {
      return
    }
    void wx.navigateTo({
      url: `/pages/item-detail/index?id=${encodeURIComponent(itemId)}`,
    })
  },

  handleSelectionToggle(event: WechatMiniprogram.BaseEvent) {
    const itemId = event.currentTarget.dataset['id'] as string | undefined
    const item = this.data.items.find((entry) => entry.id === itemId)
    if (!item) {
      return
    }
    const selected = this.data.selectedIds.includes(item.id)
    const selectedIds = selected
      ? this.data.selectedIds.filter((id) => id !== item.id)
      : [...this.data.selectedIds, item.id]
    this.setData({
      selectedIds,
      items: this.data.items.map((entry) => ({
        ...entry,
        selected: selectedIds.includes(entry.id),
      })),
    })
  },

  async handleBatchDelete() {
    if (!this.data.selectedIds.length || this.data.processing) {
      return
    }
    const confirmation = await wx.showModal({
      title: '删除离库物品',
      content: `确认删除已离库的 ${this.data.selectedIds.length} 件物品及其图片吗？删除后不可恢复。`,
      confirmText: '确认删除',
      confirmColor: '#b91c1c',
    })
    if (!confirmation.confirm) {
      return
    }
    this.setData({ processing: true, errorMessage: '' })
    try {
      const result = await batchDeleteOutboundItems({
        itemIds: this.data.selectedIds,
      })
      await wx.showToast({
        title: `已删除 ${result.itemIds.length} 件`,
        icon: 'success',
      })
      this.clearSelection()
      await this.loadFirstPage()
    } catch (error) {
      this.setData({
        errorMessage: error instanceof Error ? error.message : '删除物品失败',
      })
    } finally {
      this.setData({ processing: false })
    }
  },

  async handleRestore() {
    if (!this.data.selectedIds.length || this.data.processing) {
      return
    }
    const selectedItems = this.data.items.filter((entry) =>
      this.data.selectedIds.includes(entry.id),
    )
    if (selectedItems.length !== this.data.selectedIds.length) {
      return
    }
    const modal = this.selectComponent(
      '#text-entry-modal',
    ) as unknown as TextEntryModalInstance | null
    if (!modal) {
      return
    }
    const commitSummary = await modal.open({
      title:
        selectedItems.length === 1
          ? '重新入库'
          : `批量重新入库（${selectedItems.length} 件）`,
      placeholder: '请输入入库操作梗概（非空，最多 250 字）',
      confirmText: '确认入库',
      confirmColor: '#0f766e',
    })
    if (commitSummary === null) {
      return
    }
    const validationError = validateCommitSummary(commitSummary)
    if (validationError) {
      this.setData({ errorMessage: validationError })
      return
    }
    this.setData({ processing: true, errorMessage: '' })
    try {
      const result = await batchRestoreInbound({
        items: selectedItems.map((item) => ({
          itemId: item.id,
          expectedVersion: item.version,
        })),
        commitSummary,
      })
      await wx.showToast({
        title: `已重新入库 ${result.itemIds.length} 件`,
        icon: 'success',
      })
      this.clearSelection()
      await this.loadFirstPage()
    } catch (error) {
      this.setData({
        errorMessage:
          error instanceof Error ? error.message : '重新入库失败',
      })
    } finally {
      this.setData({ processing: false })
    }
  },

  clearSelection() {
    this.setData({
      selectedIds: [],
      items: this.data.items.map((item) => ({ ...item, selected: false })),
    })
  },

  async loadFirstPage() {
    const sequence = ++requestSequence
    this.setData({
      loading: true,
      errorMessage: '',
      nextCursor: null,
    })
    try {
      const result = await listItems({
        ...(this.data.keyword.trim()
          ? { keyword: this.data.keyword.trim() }
          : {}),
        status: 'OFF_SHELF',
        limit: 10,
      })
      if (sequence !== requestSequence) {
        return
      }
      this.setData({
        items: result.items.map((item) => toView(item, false)),
        nextCursor: result.nextCursor ?? null,
      })
    } catch (error) {
      if (sequence !== requestSequence) {
        return
      }
      this.setData({
        ...(this.data.items.length === 0 ? { items: [] } : {}),
        errorMessage:
          error instanceof Error ? error.message : '加载离库物品失败',
      })
    } finally {
      if (sequence === requestSequence) {
        this.setData({ loading: false, hasLoaded: true })
      }
    }
  },

  async loadMore() {
    if (
      this.data.loading ||
      this.data.loadingMore ||
      !this.data.nextCursor
    ) {
      return
    }
    const sequence = requestSequence
    this.setData({ loadingMore: true, errorMessage: '' })
    try {
      const result = await listItems({
        ...(this.data.keyword.trim()
          ? { keyword: this.data.keyword.trim() }
          : {}),
        status: 'OFF_SHELF',
        cursor: this.data.nextCursor,
        limit: 10,
      })
      if (sequence !== requestSequence) {
        return
      }
      this.setData({
        items: [
          ...this.data.items,
          ...result.items.map((item) => toView(item, false)),
        ],
        nextCursor: result.nextCursor ?? null,
      })
    } catch (error) {
      if (sequence === requestSequence) {
        this.setData({
          errorMessage:
            error instanceof Error ? error.message : '加载更多失败',
        })
      }
    } finally {
      if (sequence === requestSequence) {
        this.setData({ loadingMore: false })
      }
    }
  },
})

function toView(item: ItemSummary, selected: boolean): OffShelfItemView {
  const date = new Date(item.updatedAt)
  return {
    ...item,
    coverImage: item.images[0] ?? '',
    quantityText:
      item.quantityMode === 'SINGLE' ? '单件' : `${item.quantity} 件`,
    updatedAtText: Number.isNaN(date.getTime())
      ? item.updatedAt
      : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        ` ${pad(date.getHours())}:${pad(date.getMinutes())}`,
    selected,
  }
}

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}
