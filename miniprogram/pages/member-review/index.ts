import { getThemeStyle, getThemeColor } from '../../services/theme'
import {
  listPendingJoinRequests,
  reviewJoinRequest,
} from '../../services/auth'
import { ApiClientError } from '../../services/cloud-api'
import type { TextEntryModalInstance } from '../../components/text-entry-modal/types'
import type { PendingJoinRequest } from '../../types/domain'

interface PendingJoinRequestView extends PendingJoinRequest {
  createdAtText: string
}

Page({ data: {
  themeStyle: getThemeStyle(),
  loading: true,
  processingId: '',
  requests: [] as PendingJoinRequestView[],
  errorMessage: '',
},
  onLoad() {
    this.setData({ themeStyle: getThemeStyle() })
  },
  onShow() {
      this.setData({ themeStyle: getThemeStyle() })
      void this.loadRequests()
    }, onPullDownRefresh() {
      void this.loadRequests().finally(() => wx.stopPullDownRefresh())
    },
  
    async loadRequests() {
      this.setData({ loading: true, errorMessage: '' })
      try {
        const requests = await listPendingJoinRequests()
        this.setData({
          requests: requests.map((request) => ({
            ...request,
            createdAtText: formatDateTime(request.createdAt),
          })),
        })
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
      let comment: string | undefined
      if (approved) {
        const confirmation = await wx.showModal({
          title: '通过加入申请',
          content: '通过后，该成员可以访问组织仓库。',
          confirmText: '通过',
          confirmColor: getThemeColor(),
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
          title: '拒绝加入申请',
          placeholder: '请填写拒绝原因（1-250 字）',
          confirmText: '拒绝',
          confirmColor: '#b91c1c',
          maxLength: 250,
        })
        if (result === null) {
          return
        }
        comment = result
      }
  
      this.setData({ processingId: requestId, errorMessage: '' })
      try {
        await reviewJoinRequest(
          requestId,
          decision,
          comment,
        )
        await wx.showToast({
          title: approved ? '已通过' : '已拒绝',
          icon: 'success',
        })
        await this.loadRequests()
      } catch (error) {
        if (isReviewRace(error)) {
          await this.loadRequests()
          await wx.showToast({ title: '申请状态已更新', icon: 'none' })
          return
        }
        this.setData({
          errorMessage:
            error instanceof Error ? error.message : '审核失败',
        })
      } finally {
        this.setData({ processingId: '' })
      }
    }, })

function isReviewRace(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    (error.code === 'JOIN_REQUEST_REVIEWED' ||
      error.code === 'JOIN_APPLICANT_STATE_CONFLICT')
  )
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
