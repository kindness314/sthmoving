import {
  listPendingJoinRequests,
  reviewJoinRequest,
} from '../../services/auth'
import type { PendingJoinRequest } from '../../types/domain'

Page({
  data: {
    loading: true,
    processingId: '',
    requests: [] as PendingJoinRequest[],
    errorMessage: '',
  },

  onShow() {
    void this.loadRequests()
  },

  onPullDownRefresh() {
    void this.loadRequests().finally(() => wx.stopPullDownRefresh())
  },

  async loadRequests() {
    this.setData({ loading: true, errorMessage: '' })
    try {
      this.setData({ requests: await listPendingJoinRequests() })
    } catch (error) {
      this.setData({
        errorMessage:
          error instanceof Error ? error.message : '加载申请失败',
      })
    } finally {
      this.setData({ loading: false })
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
    const confirmation = await wx.showModal({
      title: approved ? '通过加入申请' : '拒绝加入申请',
      content: approved
        ? '通过后，该成员可以访问组织仓库。'
        : '',
      confirmText: approved ? '通过' : '拒绝',
      confirmColor: approved ? '#0f766e' : '#b91c1c',
      editable: !approved,
      placeholderText: approved ? '' : '可填写拒绝原因（选填）',
    })
    if (!confirmation.confirm) {
      return
    }

    this.setData({ processingId: requestId, errorMessage: '' })
    try {
      await reviewJoinRequest(
        requestId,
        decision,
        approved ? undefined : confirmation.content,
      )
      await wx.showToast({
        title: approved ? '已通过' : '已拒绝',
        icon: 'success',
      })
      await this.loadRequests()
    } catch (error) {
      this.setData({
        errorMessage:
          error instanceof Error ? error.message : '审核失败',
      })
    } finally {
      this.setData({ processingId: '' })
    }
  },
})
