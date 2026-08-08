import { listMyOutboundRequests } from '../../services/outbound'
import type { OutboundRequest } from '../../types/domain'

interface ApplicationView extends OutboundRequest {
  statusText: string
  createdAtText: string
  reviewedAtText: string
}

let requestSequence = 0

Page({
  data: {
    loading: true,
    refreshing: false,
    requests: [] as ApplicationView[],
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

  async loadRequests() {
    const sequence = ++requestSequence
    const hasContent = this.data.requests.length > 0
    this.setData({
      ...(hasContent ? { refreshing: true } : { loading: true }),
      errorMessage: '',
    })
    try {
      const requests = await listMyOutboundRequests()
      if (sequence !== requestSequence) {
        return
      }
      this.setData({ requests: requests.map(toView) })
    } catch (error) {
      if (sequence !== requestSequence) {
        return
      }
      this.setData({
        errorMessage:
          error instanceof Error ? error.message : '加载申请记录失败',
      })
    } finally {
      if (sequence === requestSequence) {
        this.setData({ loading: false, refreshing: false })
      }
    }
  },

  handleRetry() {
    void this.loadRequests()
  },
})

function toView(request: OutboundRequest): ApplicationView {
  return {
    ...request,
    statusText: getStatusText(request.status),
    createdAtText: formatDateTime(request.createdAt),
    reviewedAtText: request.reviewedAt
      ? formatDateTime(request.reviewedAt)
      : '',
  }
}

function getStatusText(status: OutboundRequest['status']): string {
  if (status === 'APPROVED') {
    return '已同意离库'
  }
  if (status === 'REJECTED') {
    return '已拒绝，可再次申请'
  }
  return '待管理员处理'
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
