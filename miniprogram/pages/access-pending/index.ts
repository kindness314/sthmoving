import {
  login,
  submitJoinRequest,
} from '../../services/auth'
import type { AccessState } from '../../types/domain'

const stateContent: Record<
  AccessState,
  { title: string; description: string; canApply: boolean }
> = {
  UNAPPLIED: {
    title: '申请加入 YUNA仓储',
    description: '请填写管理员能够识别的姓名或称呼。',
    canApply: true,
  },
  PENDING: {
    title: '加入申请处理中',
    description: '管理员审核通过后即可使用仓库。',
    canApply: false,
  },
  APPROVED: {
    title: '审核已通过',
    description: '正在进入仓库工作台。',
    canApply: false,
  },
  REJECTED: {
    title: '加入申请未通过',
    description: '你可以修改姓名或称呼后重新提交申请。',
    canApply: true,
  },
  DISABLED: {
    title: '账号已停用',
    description: '如需恢复访问，请联系组织管理员。',
    canApply: false,
  },
}

Page({
  data: {
    title: '正在检查身份',
    description: '',
    displayName: '',
    requestedRole: 'MEMBER' as 'ADMIN' | 'MEMBER',
    canApply: false,
    loading: true,
    submitting: false,
    errorMessage: '',
  },

  onShow() {
    void this.refreshSession()
  },

  async refreshSession() {
    this.setData({ loading: true, errorMessage: '' })
    try {
      const session = await login()
      getApp<IAppOption>().globalData.currentUser = session.user
      if (session.accessState === 'APPROVED') {
        await wx.reLaunch({ url: '/pages/home/index' })
        return
      }
      const content = stateContent[session.accessState]
      this.setData({
        ...content,
        displayName:
          session.user.displayName === '微信用户'
            ? ''
            : session.user.displayName,
      })
    } catch (error) {
      this.setData({ errorMessage: getErrorMessage(error, '身份刷新失败') })
    } finally {
      this.setData({ loading: false })
    }
  },

  handleDisplayNameInput(event: WechatMiniprogram.Input) {
    this.setData({ displayName: event.detail.value })
  },

  handleRequestedRoleChange(event: WechatMiniprogram.BaseEvent) {
    const value = (event as unknown as { detail: { value: string } }).detail.value
    if (value === 'ADMIN' || value === 'MEMBER') {
      this.setData({ requestedRole: value })
    }
  },

  async handleSubmit() {
    if (this.data.submitting) {
      return
    }
    this.setData({ submitting: true, errorMessage: '' })
    try {
      const session = await submitJoinRequest(
        this.data.displayName,
        this.data.requestedRole,
      )
      getApp<IAppOption>().globalData.currentUser = session.user
      const content = stateContent[session.accessState]
      this.setData({ ...content })
      await wx.showToast({ title: '申请已提交', icon: 'success' })
    } catch (error) {
      this.setData({ errorMessage: getErrorMessage(error, '提交申请失败') })
    } finally {
      this.setData({ submitting: false })
    }
  },

  handleRetry() {
    void this.refreshSession()
  },
})

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
