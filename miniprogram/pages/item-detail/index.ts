import { getItemDetail } from '../../services/items'
import { resolveItemLabel } from '../../services/labels'
import { login } from '../../services/auth'
import { directOutbound } from '../../services/outbound'
import {
  approveOutboundRequest,
  batchDeleteOutboundItems,
  getPendingOutboundByItem,
  rejectOutboundRequest,
  restoreInbound,
} from '../../services/outbound'
import { validateCommitSummary } from '../../domain/validation'
import { ApiClientError } from '../../services/cloud-api'
import type { TextEntryModalInstance } from '../../components/text-entry-modal/types'
import type { ItemDetail, UserRole } from '../../types/domain'

interface ItemDetailView extends ItemDetail {
  displayImages: string[]
  quantityText: string
  statusText: string
  registeredAtText: string
  updatedAtText: string
}

Page({
  data: {
    statusBarHeight: 0,
    itemId: '',
    scene: '',
    item: null as ItemDetailView | null,
    loading: true,
    hasLoaded: false,
    userRole: '' as UserRole | '',
    errorMessage: '',
    pendingOutbound: null as {
      id: string
      reason: string
      applicant: { displayName: string }
      createdAt: string
      createdAtText: string
    } | null,
  },

  onLoad(options: Record<string, string | undefined>) {
    const itemId = safeDecode(options['id'])
    const scene = safeDecode(options['scene'])
    const systemInfo = wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight ?? 0,
      itemId,
      scene,
    })
    void this.initialize()
  },

  onShow() {
    const userRole = getApp<IAppOption>().globalData.currentUser?.role ?? ''
    this.setData({ userRole })
    if (this.data.itemId && this.data.hasLoaded && !this.data.loading) {
      void this.loadItem()
    }
  },

  onPullDownRefresh() {
    void this.loadItem().finally(() => wx.stopPullDownRefresh())
  },

  handleRetry() {
    void this.initialize()
  },

  handleGoHome() {
    void wx.reLaunch({ url: '/pages/home/index' })
  },

  handleGoBack() {
    if (getCurrentPages().length > 1) {
      void wx.navigateBack({ delta: 1 })
      return
    }
    void wx.reLaunch({ url: '/pages/home/index' })
  },

  handlePreviewImage(event: WechatMiniprogram.BaseEvent) {
    const current = event.currentTarget.dataset['src'] as string | undefined
    const urls = this.data.item?.displayImages ?? []
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

  handleViewLogs() {
    if (!this.data.itemId) {
      return
    }
    void wx.navigateTo({
      url:
        `/pages/item-logs/index?itemId=` +
        encodeURIComponent(this.data.itemId),
    })
  },

  handleEdit() {
    if (!this.data.itemId || this.data.item?.status === 'OFF_SHELF') {
      return
    }
    void wx.navigateTo({
      url:
        `/pages/item-edit/index?itemId=` +
        encodeURIComponent(this.data.itemId),
    })
  },

  handleRequestOutbound() {
    if (!this.data.itemId || this.data.item?.status !== 'ACTIVE') {
      return
    }
    void wx.navigateTo({
      url:
        `/pages/outbound-create/index?itemId=` +
        encodeURIComponent(this.data.itemId),
    })
  },

  async handleDirectOutbound() {
    const item = this.data.item
    if (
      !this.data.itemId ||
      !item ||
      item.status !== 'ACTIVE' ||
      !isReviewer(this.data.userRole)
    ) {
      return
    }
    const modal = this.selectComponent(
      '#text-entry-modal',
    ) as unknown as TextEntryModalInstance | null
    if (!modal) {
      return
    }
    const commitSummary = await modal.open({
      title: '直接离库',
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
    this.setData({ loading: true, errorMessage: '' })
    try {
      await directOutbound({
        itemId: this.data.itemId,
        expectedVersion: item.version,
        commitSummary,
      })
      await wx.showToast({ title: '已离库', icon: 'success' })
      await this.loadItem()
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage:
          error instanceof Error ? error.message : '直接离库失败',
      })
    }
  },

  async handleApproveOutbound() {
    const request = this.data.pendingOutbound
    if (!request || this.data.loading) {
      return
    }
    const confirmation = await wx.showModal({
      title: '同意离库申请',
      content: '确认同意该物品离库吗？',
      confirmText: '同意',
      confirmColor: '#0f766e',
    })
    if (!confirmation.confirm) {
      return
    }
    this.setData({ loading: true, errorMessage: '' })
    try {
      await approveOutboundRequest(request.id)
      await wx.showToast({ title: '已同意离库', icon: 'success' })
      await this.loadItem()
    } catch (error) {
      if (isReviewRace(error)) {
        await this.loadItem()
        await wx.showToast({ title: '申请状态已更新', icon: 'none' })
        return
      }
      this.setData({ loading: false, errorMessage: getErrorMessage(error, '离库审核失败') })
    }
  },

  async handleRejectOutbound() {
    const request = this.data.pendingOutbound
    if (!request || this.data.loading) {
      return
    }
    const modal = this.selectComponent('#text-entry-modal') as unknown as TextEntryModalInstance | null
    if (!modal) {
      return
    }
    const summary = await modal.open({
      title: '拒绝离库申请',
      placeholder: '请输入拒绝原因（非空，最多250字）',
      confirmText: '拒绝',
      confirmColor: '#b91c1c',
      maxLength: 250,
    })
    if (summary === null) {
      return
    }
    const validationError = validateCommitSummary(summary)
    if (validationError) {
      this.setData({ errorMessage: validationError })
      return
    }
    this.setData({ loading: true, errorMessage: '' })
    try {
      await rejectOutboundRequest(request.id, summary)
      await wx.showToast({ title: '已拒绝离库', icon: 'success' })
      await this.loadItem()
    } catch (error) {
      if (isReviewRace(error)) {
        await this.loadItem()
        await wx.showToast({ title: '申请状态已更新', icon: 'none' })
        return
      }
      this.setData({ loading: false, errorMessage: getErrorMessage(error, '离库审核失败') })
    }
  },

  async handleRestoreInbound() {
    const item = this.data.item
    if (!item || item.status !== 'OFF_SHELF' || !isReviewer(this.data.userRole)) {
      return
    }
    const modal = this.selectComponent('#text-entry-modal') as unknown as TextEntryModalInstance | null
    if (!modal) {
      return
    }
    const summary = await modal.open({
      title: '重新入库',
      placeholder: '请输入入库操作梗概（非空，最多250字）',
      confirmText: '确认入库',
      confirmColor: '#0f766e',
      maxLength: 250,
    })
    if (summary === null) {
      return
    }
    const validationError = validateCommitSummary(summary)
    if (validationError) {
      this.setData({ errorMessage: validationError })
      return
    }
    this.setData({ loading: true, errorMessage: '' })
    try {
      await restoreInbound({ itemId: item.id, expectedVersion: item.version, commitSummary: summary })
      await wx.showToast({ title: '已重新入库', icon: 'success' })
      await this.loadItem()
    } catch (error) {
      this.setData({ loading: false, errorMessage: getErrorMessage(error, '重新入库失败') })
    }
  },

  async handleDeleteOffShelf() {
    const item = this.data.item
    if (!item || item.status !== 'OFF_SHELF' || !isReviewer(this.data.userRole)) {
      return
    }
    const confirmation = await wx.showModal({
      title: '删除离库物品',
      content: '删除后不可恢复，确认删除该物品及其图片吗？',
      confirmText: '删除',
      confirmColor: '#b91c1c',
    })
    if (!confirmation.confirm) {
      return
    }
    this.setData({ loading: true, errorMessage: '' })
    try {
      await batchDeleteOutboundItems({ itemIds: [item.id] })
      await wx.showToast({ title: '已删除', icon: 'success' })
      await wx.navigateBack()
    } catch (error) {
      this.setData({ loading: false, errorMessage: getErrorMessage(error, '删除失败') })
    }
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

  async initialize() {
    this.setData({ loading: true, errorMessage: '' })
    try {
      const session = await login()
      getApp<IAppOption>().globalData.currentUser = session.user
      this.setData({ userRole: session.user.role })
      if (session.accessState !== 'APPROVED') {
        await wx.reLaunch({ url: '/pages/access-pending/index' })
        return
      }
      if (this.data.itemId) {
        await this.loadItem()
        return
      }
      if (this.data.scene) {
        await this.resolveScene()
        return
      }
      this.setData({
        loading: false,
        errorMessage: '物品链接无效',
      })
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: getErrorMessage(error, '登录或读取物品失败'),
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
      const view = toItemDetailView(item)
      let pendingOutbound = null
      if (view.status === 'OUTBOUND_PENDING' && isReviewer(this.data.userRole)) {
        const request = await getPendingOutboundByItem(item.id)
        pendingOutbound = request
          ? { ...request, createdAtText: formatDateTime(request.createdAt) }
          : null
      }
      this.setData({ item: view, pendingOutbound })
    } catch (error) {
      this.setData({
        item: null,
        errorMessage:
          error instanceof Error ? error.message : '加载物品详情失败',
      })
    } finally {
      this.setData({ loading: false, hasLoaded: true })
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

function isReviewer(role: UserRole | ''): boolean {
  return role === 'ADMIN' || role === 'MANAGER' || role === 'OWNER'
}

function isReviewRace(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    (error.code === 'OUTBOUND_REQUEST_REVIEWED' ||
      error.code === 'OUTBOUND_STATE_CONFLICT')
  )
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function toItemDetailView(item: ItemDetail): ItemDetailView {
  return {
    ...item,
    displayImages: item.images,
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
