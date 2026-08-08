import { validateCommitSummary } from '../../domain/validation'
import { createOutboundRequest } from '../../services/outbound'

Page({
  data: {
    itemId: '',
    reason: '',
    submitting: false,
    errorMessage: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    const itemId = safeDecode(options['itemId'])
    this.setData({ itemId })
    if (!itemId) {
      this.setData({ errorMessage: '物品链接无效' })
    }
  },

  handleReasonInput(event: WechatMiniprogram.TextareaInput) {
    this.setData({ reason: event.detail.value, errorMessage: '' })
  },

  async handleSubmit() {
    if (this.data.submitting || !this.data.itemId) {
      return
    }
    const validationError = validateCommitSummary(this.data.reason)
    if (validationError) {
      this.setData({
        errorMessage: validationError.replace('提交梗概', '离库原因'),
      })
      return
    }

    this.setData({ submitting: true, errorMessage: '' })
    try {
      await createOutboundRequest({
        itemId: this.data.itemId,
        reason: this.data.reason,
      })
      await wx.showModal({
        title: '申请已提交',
        content: '物品已进入离库申请中，等待管理员处理。',
        showCancel: false,
        confirmText: '返回物品',
      })
      await wx.navigateBack({ delta: 1 })
    } catch (error) {
      this.setData({
        errorMessage:
          error instanceof Error ? error.message : '提交离库申请失败',
      })
    } finally {
      this.setData({ submitting: false })
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
