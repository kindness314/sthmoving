import { listCategories } from '../../services/categories'
import { listItems } from '../../services/items'
import { batchDirectOutbound } from '../../services/outbound'
import { validateCommitSummary } from '../../domain/validation'
import type { TextEntryModalInstance } from '../../components/text-entry-modal/types'
import type {
  Category,
  ItemListCursor,
  ItemSummary,
  UserRole,
} from '../../types/domain'

interface ItemListView extends ItemSummary {
  coverImage: string
  quantityText: string
  statusText: string
  statusClass: string
  updatedAtText: string
  selected: boolean
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
    hasLoaded: false,
    loadingMore: false,
    userRole: '' as UserRole | '',
    managementMode: false,
    selectedIds: [] as string[],
    selectionAction: '' as 'DIRECT' | '',
    batchProcessing: false,
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

  onShow() {
    const userRole = getApp<IAppOption>().globalData.currentUser?.role ?? ''
    const canManage =
      userRole === 'ADMIN' || userRole === 'MANAGER' || userRole === 'OWNER'
    this.setData({
      userRole,
      ...(canManage ? {} : {
        managementMode: false,
        selectedIds: [],
        selectionAction: '',
      }),
    })
    if (this.data.hasLoaded && !this.data.loading) {
      void Promise.all([this.loadCategories(), this.loadFirstPage()])
    }
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
    if (this.data.managementMode) {
      return
    }
    const itemId = event.currentTarget.dataset['id'] as string | undefined
    if (!itemId) {
      return
    }
    void wx.navigateTo({
      url: `/pages/item-detail/index?id=${encodeURIComponent(itemId)}`,
    })
  },

  handleToggleManagement() {
    if (
      this.data.userRole !== 'ADMIN' &&
      this.data.userRole !== 'MANAGER' &&
      this.data.userRole !== 'OWNER'
    ) {
      return
    }
    const managementMode = !this.data.managementMode
    this.setData({
      managementMode,
      selectedIds: [],
      selectionAction: '',
    })
    void this.loadFirstPage()
  },

  handleSelectionToggle(event: WechatMiniprogram.BaseEvent) {
    const itemId = event.currentTarget.dataset['id'] as string | undefined
    const item = this.data.items.find((entry) => entry.id === itemId)
    if (!item || item.status !== 'ACTIVE') {
      return
    }
    const selected = this.data.selectedIds.includes(item.id)
    if (!selected && this.data.selectionAction &&
      this.data.selectionAction !== actionForStatus(item.status)) {
      void wx.showToast({
      title: '批量离库只能选择在库物品',
        icon: 'none',
      })
      return
    }
    const selectedIds = selected
      ? this.data.selectedIds.filter((id) => id !== item.id)
      : [...this.data.selectedIds, item.id]
    const selectionAction = selectedIds.length
      ? actionForStatus(
          this.data.items.find((entry) => entry.id === selectedIds[0])?.status ??
            item.status,
        )
      : ''
    this.setData({
      selectedIds,
      selectionAction,
      items: this.data.items.map((entry) => ({
        ...entry,
        selected: selectedIds.includes(entry.id),
      })),
    })
  },

  async handleBatchOutbound() {
    if (
      !this.data.selectedIds.length ||
      this.data.selectionAction !== 'DIRECT' ||
      this.data.batchProcessing
    ) {
      return
    }
    const selectedItems = this.data.items.filter((item) =>
      this.data.selectedIds.includes(item.id),
    )
    if (selectedItems.length !== this.data.selectedIds.length) {
      this.clearSelection()
      return
    }
    const modal = this.selectComponent(
      '#text-entry-modal',
    ) as unknown as TextEntryModalInstance | null
    if (!modal) {
      return
    }
    const commitSummary = await modal.open({
      title: '批量离库',
      placeholder: '请输入离库操作梗概（非空，最多 250 字）',
      confirmText: '确认离库',
      confirmColor: '#b91c1c',
    })
    if (commitSummary === null) {
      return
    }
    const validationError = validateCommitSummary(commitSummary)
    if (validationError) {
      this.setData({ errorMessage: validationError })
      return
    }
    this.setData({ batchProcessing: true, errorMessage: '' })
    try {
      await batchDirectOutbound({
        items: selectedItems.map((item) => ({
          itemId: item.id,
          expectedVersion: item.version,
        })),
        commitSummary,
      })
      await wx.showToast({ title: '批量离库成功', icon: 'success' })
      this.clearSelection()
      await this.loadFirstPage()
    } catch (error) {
      this.setData({
        errorMessage:
          error instanceof Error ? error.message : '批量离库失败',
      })
    } finally {
      this.setData({ batchProcessing: false })
    }
  },

  clearSelection() {
    this.setData({
      selectedIds: [],
      selectionAction: '',
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
      const result = await listItems(this.createQuery())
      if (sequence !== requestSequence) {
        return
      }
      this.setData({
        items: result.items.map((item) =>
          toItemListView(item, this.data.selectedIds.includes(item.id)),
        ),
        nextCursor: result.nextCursor ?? null,
      })
    } catch (error) {
      if (sequence !== requestSequence) {
        return
      }
      this.setData({
        ...(this.data.items.length === 0 ? { items: [] } : {}),
        errorMessage:
          error instanceof Error ? error.message : '加载物品失败',
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
      const result = await listItems(
        this.createQuery(this.data.nextCursor),
      )
      if (sequence !== requestSequence) {
        return
      }
      this.setData({
        items: [
          ...this.data.items,
          ...result.items.map((item) => toItemListView(item, false)),
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

function toItemListView(item: ItemSummary, selected = false): ItemListView {
  const coverFileId = item.images[0]
  return {
    ...item,
    coverImage: coverFileId ?? '',
    quantityText:
      item.quantityMode === 'SINGLE' ? '单件' : `${item.quantity} 件`,
    statusText:
      item.status === 'OUTBOUND_PENDING'
        ? '离库申请中'
        : item.status === 'OFF_SHELF'
          ? '已离库'
          : '在库',
    statusClass:
      item.status === 'OUTBOUND_PENDING'
        ? 'pending'
        : item.status === 'OFF_SHELF'
          ? 'off-shelf'
          : '',
    updatedAtText: formatDateTime(item.updatedAt),
    selected,
  }
}

function actionForStatus(
  status: ItemSummary['status'],
): 'DIRECT' | '' {
  return status === 'ACTIVE' ? 'DIRECT' : ''
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
