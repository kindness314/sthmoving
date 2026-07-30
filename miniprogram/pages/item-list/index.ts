import { listCategories } from '../../services/categories'
import { listItems } from '../../services/items'
import type {
  Category,
  ItemListCursor,
  ItemSummary,
} from '../../types/domain'

interface ItemListView extends ItemSummary {
  coverImage: string
  quantityText: string
  statusText: string
  updatedAtText: string
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
let requestSequence = 0

Page({
  data: {
    keyword: '',
    categories: [] as Category[],
    categoryNames: ['全部分类'],
    categoryIndex: 0,
    items: [] as ItemListView[],
    nextCursor: null as ItemListCursor | null,
    loading: true,
    loadingMore: false,
    errorMessage: '',
  },

  onLoad() {
    void Promise.all([this.loadCategories(), this.loadFirstPage()])
  },

  onUnload() {
    if (searchTimer) {
      clearTimeout(searchTimer)
      searchTimer = undefined
    }
    requestSequence += 1
  },

  onPullDownRefresh() {
    void Promise.all([this.loadCategories(), this.loadFirstPage()]).finally(
      () => wx.stopPullDownRefresh(),
    )
  },

  onReachBottom() {
    void this.loadMore()
  },

  async loadCategories() {
    try {
      const categories = await listCategories()
      const selected =
        this.data.categoryIndex > 0
          ? this.data.categories[this.data.categoryIndex - 1]?.id
          : undefined
      const selectedIndex = selected
        ? categories.findIndex((category) => category.id === selected) + 1
        : 0
      this.setData({
        categories,
        categoryNames: [
          '全部分类',
          ...categories.map((category) => category.name),
        ],
        categoryIndex: Math.max(0, selectedIndex),
      })
    } catch (error) {
      this.setData({
        errorMessage:
          error instanceof Error ? error.message : '加载分类失败',
      })
    }
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

  handleCategoryChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ categoryIndex: Number(event.detail.value) })
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

  async loadFirstPage() {
    const sequence = ++requestSequence
    this.setData({
      loading: true,
      errorMessage: '',
      nextCursor: null,
    })
    try {
      const result = await listItems(this.createQuery())
      if (sequence !== requestSequence) {
        return
      }
      this.setData({
        items: result.items.map(toItemListView),
        nextCursor: result.nextCursor ?? null,
      })
    } catch (error) {
      if (sequence !== requestSequence) {
        return
      }
      this.setData({
        items: [],
        errorMessage:
          error instanceof Error ? error.message : '加载物品失败',
      })
    } finally {
      if (sequence === requestSequence) {
        this.setData({ loading: false })
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
      const result = await listItems(
        this.createQuery(this.data.nextCursor),
      )
      if (sequence !== requestSequence) {
        return
      }
      this.setData({
        items: [
          ...this.data.items,
          ...result.items.map(toItemListView),
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

  createQuery(cursor?: ItemListCursor) {
    const keyword = this.data.keyword.trim()
    const category =
      this.data.categoryIndex > 0
        ? this.data.categories[this.data.categoryIndex - 1]
        : undefined
    return {
      ...(keyword ? { keyword } : {}),
      ...(category ? { categoryId: category.id } : {}),
      ...(cursor ? { cursor } : {}),
      limit: 10,
    }
  },
})

function toItemListView(item: ItemSummary): ItemListView {
  return {
    ...item,
    coverImage: item.images[0] ?? '',
    quantityText:
      item.quantityMode === 'SINGLE' ? '单件' : `${item.quantity} 件`,
    statusText:
      item.status === 'OUTBOUND_PENDING' ? '离库申请中' : '在库',
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
