import { listItemLogs } from '../../services/items'
import type { ItemOperationLog } from '../../types/domain'

interface ItemOperationLogView extends ItemOperationLog {
  actionText: string
  actionClass: string
  operatedAtText: string
}

Page({
  data: {
    itemId: '',
    logs: [] as ItemOperationLogView[],
    loading: true,
    errorMessage: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    const itemId = safeDecode(options['itemId'])
    this.setData({ itemId })
    if (!itemId) {
      this.setData({
        loading: false,
        errorMessage: '物品链接无效',
      })
      return
    }
    void this.loadLogs()
  },

  onPullDownRefresh() {
    void this.loadLogs().finally(() => wx.stopPullDownRefresh())
  },

  handleRetry() {
    void this.loadLogs()
  },

  async loadLogs() {
    if (!this.data.itemId) {
      return
    }
    this.setData({ loading: true, errorMessage: '' })
    try {
      const logs = await listItemLogs(this.data.itemId)
      this.setData({ logs: logs.map(toLogView) })
    } catch (error) {
      this.setData({
        logs: [],
        errorMessage:
          error instanceof Error ? error.message : '加载操作日志失败',
      })
    } finally {
      this.setData({ loading: false })
    }
  },
})

function toLogView(log: ItemOperationLog): ItemOperationLogView {
  return {
    ...log,
    actionText: getActionText(log.action),
    actionClass: log.action === 'OUTBOUND_REJECT' ? 'rejected' : '',
    operatedAtText: formatDateTime(log.operatedAt),
  }
}

function getActionText(action: ItemOperationLog['action']): string {
  if (action === 'CREATE') {
    return '登记'
  }
  if (action === 'UPDATE') {
    return '编辑'
  }
  if (action === 'OUTBOUND_REQUEST') {
    return '离库申请'
  }
  if (action === 'OUTBOUND_APPROVE') {
    return '离库（已同意）'
  }
  if (action === 'OUTBOUND_REJECT') {
    return '离库申请（已拒绝）'
  }
  if (action === 'INBOUND') {
    return '重新入库'
  }
  return '离库'
}

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
