import { login, listPendingJoinRequests } from '../../services/auth'
import { listPendingOutboundRequests } from '../../services/outbound'
import type { User } from '../../types/domain'

interface Shortcut {
  key: string
  title: string
  description: string
  badge?: number
}

interface ShortcutGroup {
  key: string
  title: string
  shortcuts: Shortcut[]
}

const personalShortcuts: Shortcut[] = [
  { key: 'scan', title: '扫码查询', description: '扫描物品上的小程序码' },
  { key: 'search', title: '文字搜索', description: '按名称或详情查找物品' },
  { key: 'create', title: '登记物品', description: '录入信息并绑定实体标签' },
  { key: 'requests', title: '申请中心', description: '查看我的离库申请' },
]

const memberShortcutGroups: ShortcutGroup[] = [
  { key: 'personal', title: '个人处理', shortcuts: personalShortcuts },
]

Page({
  data: {
    userName: '',
    loading: true,
    shortcutGroups: memberShortcutGroups,
  },

  onShow() {
    void this.refreshSession()
  },

  async refreshSession() {
    this.setData({ loading: true })
    try {
      const session = await login()
      if (session.accessState !== 'APPROVED') {
        await wx.reLaunch({ url: '/pages/access-pending/index' })
        return
      }
      getApp<IAppOption>().globalData.currentUser = session.user
      const reviewer =
        session.user.role === 'ADMIN' ||
        session.user.role === 'MANAGER' ||
        session.user.role === 'OWNER'
      const [pendingJoinRequests, pendingOutboundRequests] = reviewer
        ? await Promise.all([
            listPendingJoinRequests(),
            listPendingOutboundRequests(),
          ])
        : [[], []]
      this.setData({
        userName: session.user.displayName,
        shortcutGroups: getShortcutGroups(
          session.user,
          pendingJoinRequests.length,
          pendingOutboundRequests.length,
        ),
      })
    } catch (error) {
      await wx.showToast({
        title: error instanceof Error ? error.message : '身份刷新失败',
        icon: 'none',
      })
      await wx.reLaunch({ url: '/pages/login/index' })
    } finally {
      this.setData({ loading: false })
    }
  },

  handleShortcut(event: WechatMiniprogram.BaseEvent) {
    const key = event.currentTarget.dataset['key'] as string | undefined
    if (key === 'scan') {
      void wx.navigateTo({ url: '/pages/scan/index' })
      return
    }
    if (key === 'member-review') {
      void wx.navigateTo({ url: '/pages/member-review/index' })
      return
    }
    if (key === 'categories') {
      void wx.navigateTo({ url: '/pages/category-manage/index' })
      return
    }
    if (key === 'outbound') {
      void wx.navigateTo({ url: '/pages/outbound-list/index' })
      return
    }
    if (key === 'off-shelf') {
      void wx.navigateTo({ url: '/pages/off-shelf-list/index' })
      return
    }
    if (key === 'member-list') {
      void wx.navigateTo({ url: '/pages/member-list/index' })
      return
    }
    if (key === 'requests') {
      void wx.navigateTo({ url: '/pages/application-center/index' })
      return
    }
    if (key === 'create') {
      void wx.navigateTo({ url: '/pages/item-create/index' })
      return
    }
    if (key === 'search') {
      void wx.navigateTo({ url: '/pages/item-list/index' })
      return
    }
    void wx.showToast({
      title: `${key ?? '功能'}模块待实现`,
      icon: 'none',
    })
  },
})

function getShortcutGroups(
  user: User,
  pendingJoinCount = 0,
  pendingOutboundCount = 0,
): ShortcutGroup[] {
  if (
    user.role === 'ADMIN' ||
    user.role === 'MANAGER' ||
    user.role === 'OWNER'
  ) {
    return [
      { key: 'personal', title: '个人处理', shortcuts: personalShortcuts },
      {
        key: 'warehouse',
        title: '仓库管理',
        shortcuts: [
          {
            key: 'member-review',
            ...(pendingJoinCount > 0 ? { badge: pendingJoinCount } : {}),
            title: '成员审核',
            description: '处理新的组织加入申请',
          },
          {
            key: 'categories',
            title: '分类管理',
            description: '整理、重命名或停用自定义分类',
          },
          {
            key: 'outbound',
            ...(pendingOutboundCount > 0
              ? { badge: pendingOutboundCount }
              : {}),
            title: '离库审核',
            description: '处理成员提交的离库申请',
          },
          {
            key: 'off-shelf',
            title: '离库物品',
            description: '查看和删除已离库物品',
          },
          {
            key: 'member-list',
            title: '成员管理',
            description: '管理成员、管理员与实际管理者',
          },
        ],
      },
    ]
  }
  return memberShortcutGroups
}
