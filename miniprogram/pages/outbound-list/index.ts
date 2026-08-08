import {
  approveOutboundRequest,
  listPendingOutboundRequests,
  rejectOutboundRequest,
} from '../../services/outbound'
import { ApiClientError } from '../../services/cloud-api'
import { validateCommitSummary } from '../../domain/validation'
import type { TextEntryModalInstance } from '../../components/text-entry-modal/types'
import type { OutboundRequest } from '../../types/domain'

let requestSequence = 0

Page({
  data: {
    loading: true,
    refreshing: false,
    processingId: '',
    requests: [] as OutboundRequest[],
    errorMessage: '',
  },

  onShow() {
    void this.loadRequests()
  },

  onUnload() {
    requestSequence += 1
  },

  onPullDownRefresh() {
    void this.loadRequests().finally(() => wx.stopPullDownRefresh())
  },

  handleRetry() {
    void this.loadRequests()
  },

  async loadRequests() {
    const sequence = ++requestSequence
    const hasContent = this.data.requests.length > 0
    this.setData({
      ...(hasContent ? { refreshing: true } : { loading: true }),
      errorMessage: '',
    })
    try {
      const requests = await listPendingOutboundRequests()
      if (sequence !== requestSequence) {
        return
      }
      this.setData({ requests })
    } catch (error) {
      if (sequence !== requestSequence) {
        return
      }
      this.setData({
        errorMessage: getErrorMessage(error, '加载离库申请失败'),
      })
    } finally {
      if (sequence === requestSequence) {
        this.setData({ loading: false, refreshing: false })
      }
    }
  },

  async handleReview(event: WechatMiniprogram.BaseEvent) {
    const requestId = event.currentTarget.dataset['id'] as string | undefined
    const decision = event.currentTarget.dataset['decision'] as
      | 'APPROVE'
      | 'REJECT'
      | undefined
    if (!requestId || !decision || this.data.processingId) {
      return
    }

    const approved = decision === 'APPROVE'
    let reviewSummary: string | undefined
    if (approved) {
      const confirmation = await wx.showModal({
        title: '同意离库申请',
        content: '确认同意该物品离库吗？',
        confirmText: '同意',
        confirmColor: '#0f766e',
      })
      if (!confirmation.confirm) {
        return
      }
    } else {
      const modal = this.selectComponent(
        '#text-entry-modal',
      ) as unknown as TextEntryModalInstance | null
      if (!modal) {
        return
      }
      const result = await modal.open({
        title: '拒绝离库申请',
        placeholder: '请输入拒绝原因（非空，最多 250 字）',
        confirmText: '拒绝',
        confirmColor: '#b91c1c',
      })
      if (result === null) {
        return
      }
      reviewSummary = result
      const validationError = validateCommitSummary(reviewSummary)
      if (validationError) {
        this.setData({ errorMessage: validationError })
        return
      }
    }

    this.setData({ processingId: requestId, errorMessage: '' })
    try {
      if (approved) {
        await approveOutboundRequest(requestId)
      } else {
        if (!reviewSummary) {
          return
        }
        await rejectOutboundRequest(requestId, reviewSummary)
      }
      this.setData({
        requests: this.data.requests.filter((request) => request.id !== requestId),
      })
      await wx.showToast({
        title: approved ? '已同意离库' : '已拒绝离库',
        icon: 'success',
      })
    } catch (error) {
      if (isReviewRace(error)) {
        await this.loadRequests()
        await wx.showToast({ title: '申请状态已更新', icon: 'none' })
        return
      }
      this.setData({
        errorMessage: getErrorMessage(error, '离库审核失败'),
      })
    } finally {
      this.setData({ processingId: '' })
    }
  },

  handleViewItem(event: WechatMiniprogram.BaseEvent) {
    const itemId = event.currentTarget.dataset['itemId'] as string | undefined
    if (!itemId) {
      return
    }
    void wx.navigateTo({
      url: `/pages/item-detail/index?id=${encodeURIComponent(itemId)}`,
    })
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

function isReviewRace(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    (error.code === 'OUTBOUND_REQUEST_REVIEWED' ||
      error.code === 'OUTBOUND_STATE_CONFLICT')
  )
}
