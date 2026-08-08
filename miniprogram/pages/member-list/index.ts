import {
  appointManager,
  disableMember,
  login,
  listMembers,
  removeManager,
  setAdminRole,
  transferManager,
} from '../../services/auth'
import type { PublicMember, UserRole } from '../../types/domain'

Page({
  data: {
    loading: true,
    processingId: '',
    members: [] as PublicMember[],
    hasManager: false,
    currentRole: '' as UserRole | '',
    errorMessage: '',
  },

  onShow() {
    this.setData({
      currentRole: getApp<IAppOption>().globalData.currentUser?.role ?? '',
    })
    void this.loadMembers()
  },

  onPullDownRefresh() {
    void this.loadMembers().finally(() => wx.stopPullDownRefresh())
  },

  async loadMembers() {
    this.setData({ loading: true, errorMessage: '' })
    try {
      const members = await listMembers()
      this.setData({
        members,
        hasManager: members.some(
          (member) => member.status === 'APPROVED' && member.role === 'MANAGER',
        ),
      })
    } catch (error) {
      this.setData({ errorMessage: getErrorMessage(error, '成员加载失败') })
    } finally {
      this.setData({ loading: false })
    }
  },

  async handleRole(event: WechatMiniprogram.BaseEvent) {
    const userId = event.currentTarget.dataset['id'] as string | undefined
    const role = event.currentTarget.dataset['role'] as 'ADMIN' | 'MEMBER' | undefined
    if (!userId || !role || this.data.processingId) {
      return
    }
    const confirmation = await wx.showModal({
      title: role === 'ADMIN' ? '设为管理员' : '取消管理员',
      content: role === 'ADMIN' ? '确认将该成员设为管理员吗？' : '确认取消该成员的管理员权限吗？',
      confirmText: '确认',
    })
    if (!confirmation.confirm) {
      return
    }
    await this.runAction(userId, () => setAdminRole(userId, role))
  },

  async handleDisable(event: WechatMiniprogram.BaseEvent) {
    const userId = event.currentTarget.dataset['id'] as string | undefined
    if (!userId || this.data.processingId) {
      return
    }
    const confirmation = await wx.showModal({
      title: '移除成员',
      content: '移除后账号将被停用，但历史记录会保留。确认继续吗？',
      confirmText: '移除',
      confirmColor: '#b91c1c',
    })
    if (!confirmation.confirm) {
      return
    }
    await this.runAction(userId, () => disableMember(userId))
  },

  async handleAppoint(event: WechatMiniprogram.BaseEvent) {
    const userId = event.currentTarget.dataset['id'] as string | undefined
    if (!userId || this.data.processingId) {
      return
    }
    await this.runAction(userId, () => appointManager(userId))
  },

  async handleRemoveManager(event: WechatMiniprogram.BaseEvent) {
    const userId = event.currentTarget.dataset['id'] as string | undefined
    if (!userId || this.data.processingId) {
      return
    }
    await this.runAction(userId, () => removeManager(userId))
  },

  async handleTransfer(event: WechatMiniprogram.BaseEvent) {
    const userId = event.currentTarget.dataset['id'] as string | undefined
    if (!userId || this.data.processingId) {
      return
    }
    const confirmation = await wx.showModal({
      title: '传位实际管理者',
      content: '传位后你将成为管理员，确认继续吗？',
      confirmText: '传位',
    })
    if (!confirmation.confirm) {
      return
    }
    await this.runAction(userId, () => transferManager(userId))
  },

  async runAction(userId: string, action: () => Promise<PublicMember>) {
    this.setData({ processingId: userId, errorMessage: '' })
    try {
      await action()
      try {
        const session = await login()
        getApp<IAppOption>().globalData.currentUser = session.user
        this.setData({ currentRole: session.user.role })
      } catch {
        // 操作已成功，角色刷新失败时由下一次进入页面重新同步。
      }
      await wx.showToast({ title: '已更新', icon: 'success' })
      await this.loadMembers()
    } catch (error) {
      this.setData({ errorMessage: getErrorMessage(error, '成员操作失败') })
    } finally {
      this.setData({ processingId: '' })
    }
  },
})

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
