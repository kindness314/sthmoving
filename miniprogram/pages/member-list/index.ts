import { getThemeStyle } from '../../services/theme'
import {
  appointManager,
  disableMember,
  login,
  listMembers,
  removeManager,
  setAdminRole,
  transferManager,
} from '../../services/auth'
import {
  disableTestAccess,
  enableTestAccess,
  fetchTestAccessInfo,
} from '../../services/review'
import type { TestAccessInfo } from '../../services/review'
import type { PublicMember, UserRole } from '../../types/domain'

interface MemberView extends PublicMember {
  roleText: string
  statusText: string
}

interface TestAccessView {
  enabled: boolean
  expiresAtText: string
  createdAtText: string
  useCount: number
  lastUsedAtText: string
}

Page({ data: {
  themeStyle: getThemeStyle(),
  loading: true,
  processingId: '',
  members: [] as MemberView[],
  hasManager: false,
  currentRole: '' as UserRole | '',
  errorMessage: '',
  testAccessInfo: null as TestAccessView | null,
  testAccessProcessing: false,
  generatedPassword: '',
},
  onLoad() {
    this.setData({ themeStyle: getThemeStyle() })
  },
  onShow() {
      this.setData({ themeStyle: getThemeStyle() })
      this.setData({
        currentRole: getApp<IAppOption>().globalData.currentUser?.role ?? '',
      })
      void this.loadMembers()
      void this.loadTestAccess()
    }, onPullDownRefresh() {
      void this.loadMembers().finally(() => wx.stopPullDownRefresh())
    },
  
    async loadMembers() {
      this.setData({ loading: true, errorMessage: '' })
      try {
        const members = await listMembers()
        this.setData({
          members: members.map(toMemberView),
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
  
    async loadTestAccess() {
      const role = this.data.currentRole
      if (role !== 'MANAGER' && role !== 'OWNER') {
        this.setData({ testAccessInfo: null })
        return
      }
      try {
        const info = await fetchTestAccessInfo()
        this.setData({ testAccessInfo: toTestAccessView(info) })
      } catch {
        // 无法读取（例如沙箱环境返回 TEST_ACCESS_UNAVAILABLE）时不渲染卡片。
        this.setData({ testAccessInfo: null, generatedPassword: '' })
      }
    },

    async handleGenerateTestPassword() {
      if (this.data.testAccessProcessing) {
        return
      }
      this.setData({ testAccessProcessing: true, errorMessage: '' })
      try {
        const result = await enableTestAccess()
        this.setData({
          generatedPassword: result.password,
          testAccessInfo: {
            enabled: true,
            expiresAtText: formatDateTime(result.expiresAt),
            createdAtText: '—',
            useCount: 0,
            lastUsedAtText: '—',
          },
        })
        await wx.showToast({ title: '口令已生成', icon: 'success' })
      } catch (error) {
        this.setData({ errorMessage: getErrorMessage(error, '生成测试口令失败') })
      } finally {
        this.setData({ testAccessProcessing: false })
      }
    },

    async handleDisableTestAccess() {
      if (this.data.testAccessProcessing) {
        return
      }
      const confirmation = await wx.showModal({
        title: '关闭测试入口',
        content: '关闭后审核员将无法再用测试口令进入沙箱，确认继续吗？',
        confirmText: '关闭',
      })
      if (!confirmation.confirm) {
        return
      }
      this.setData({ testAccessProcessing: true, errorMessage: '' })
      try {
        await disableTestAccess()
        const current = this.data.testAccessInfo
        this.setData({
          generatedPassword: '',
          testAccessInfo: current ? { ...current, enabled: false } : null,
        })
        await wx.showToast({ title: '已关闭', icon: 'success' })
      } catch (error) {
        this.setData({ errorMessage: getErrorMessage(error, '关闭测试入口失败') })
      } finally {
        this.setData({ testAccessProcessing: false })
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
    }, })

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function toTestAccessView(info: TestAccessInfo): TestAccessView {
  return {
    enabled: info.enabled,
    expiresAtText: info.expiresAt ? formatDateTime(info.expiresAt) : '—',
    createdAtText: info.createdAt ? formatDateTime(info.createdAt) : '—',
    useCount: info.useCount,
    lastUsedAtText: info.lastUsedAt ? formatDateTime(info.lastUsedAt) : '—',
  }
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  const pad = (part: number) => part.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toMemberView(member: PublicMember): MemberView {
  const roleText: Record<UserRole, string> = {
    OWNER: '所有者',
    MANAGER: '实际管理者',
    ADMIN: '管理员',
    MEMBER: '普通成员',
  }
  const statusText: Record<PublicMember['status'], string> = {
    PENDING: '待审核',
    APPROVED: '已加入',
    REJECTED: '已拒绝',
    DISABLED: '已停用',
  }
  return {
    ...member,
    roleText: roleText[member.role],
    statusText: statusText[member.status],
  }
}
