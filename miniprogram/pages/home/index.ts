import { login, listPendingJoinRequests } from '../../services/auth'
import { listPendingOutboundRequests } from '../../services/outbound'
import { getThemeStyle, storeTheme } from '../../services/theme'
import type { TabBarInstance } from '../../services/theme'
import type { User } from '../../types/domain'

interface Shortcut {
  key: string
  title: string
  description: string
  icon: string
  badge?: number
}

interface ShortcutGroup {
  key: string
  title: string
  shortcuts: Shortcut[]
}

const personalShortcuts: Shortcut[] = [
  {
    key: 'scan',
    title: '扫码查询',
    description: '扫一扫物品标签，直达详情',
    icon: '/assets/icons/scan.svg',
  },
  {
    key: 'search',
    title: '文字搜索',
    description: '按名称、详情或编码查找',
    icon: '/assets/icons/search.svg',
  },
  {
    key: 'create',
    title: '登记物品',
    description: '录入新物品并生成专属标签',
    icon: '/assets/icons/file-add.svg',
  },
  {
    key: 'requests',
    title: '申请中心',
    description: '我的离库申请与处理进度',
    icon: '/assets/icons/profile.svg',
  },
]

const memberShortcutGroups: ShortcutGroup[] = [
  { key: 'personal', title: '常用功能', shortcuts: personalShortcuts },
]

Page({ data: {
  themeStyle: getThemeStyle(),
  userName: '',
  loading: true,
  shortcutGroups: memberShortcutGroups,
},
  onLoad() {
    this.setData({ themeStyle: getThemeStyle() })
  },
  onShow() {
      this.setData({ themeStyle: getThemeStyle() })
      ;(this.getTabBar() as unknown as TabBarInstance | null)?.syncState(0)
      void this.refreshSession()
    }, async refreshSession() {
      this.setData({ loading: true })
      try {
        const session = await login()
        if (session.accessState !== 'APPROVED') {
          await wx.reLaunch({ url: '/pages/access-pending/index' })
          return
        }
        getApp<IAppOption>().globalData.currentUser = session.user
        storeTheme(session.user.theme)
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
          themeStyle: getThemeStyle(session.user.theme),
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
    }, })

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
      { key: 'personal', title: '常用功能', shortcuts: personalShortcuts },
      {
        key: 'warehouse',
        title: '仓库管理',
        shortcuts: [
          {
            key: 'member-review',
            ...(pendingJoinCount > 0 ? { badge: pendingJoinCount } : {}),
            title: '成员审核',
            description: '审批新成员的加入申请',
            icon: '/assets/icons/audit.svg',
          },
          {
            key: 'categories',
            title: '分类管理',
            description: '新建、重命名或停用分类',
            icon: '/assets/icons/appstore.svg',
          },
          {
            key: 'outbound',
            ...(pendingOutboundCount > 0
              ? { badge: pendingOutboundCount }
              : {}),
            title: '离库审核',
            description: '审批成员的离库申请',
            icon: '/assets/icons/export.svg',
          },
          {
            key: 'off-shelf',
            title: '离库物品',
            description: '已离库物品的查看与清理',
            icon: '/assets/icons/database.svg',
          },
          {
            key: 'member-list',
            title: '成员管理',
            description: '角色调整、任命与成员移除',
            icon: '/assets/icons/team.svg',
          },
        ],
      },
    ]
  }
  return memberShortcutGroups
}
