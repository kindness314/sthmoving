import { login } from '../../services/auth'
import type { User } from '../../types/domain'

interface Shortcut {
  key: string
  title: string
  description: string
}

const memberShortcuts: Shortcut[] = [
  { key: 'scan', title: '扫码查询', description: '扫描物品上的小程序码' },
  { key: 'search', title: '文字搜索', description: '按名称或详情查找物品' },
  { key: 'create', title: '登记物品', description: '录入信息并绑定实体标签' },
  {
    key: 'categories',
    title: '物品分类',
    description: '查看预设分类或新建分类',
  },
  { key: 'requests', title: '申请中心', description: '查看加入与离库申请' },
]

Page({
  data: {
    userName: '',
    loading: true,
    shortcuts: memberShortcuts,
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
      this.setData({
        userName: session.user.displayName,
        shortcuts: getShortcuts(session.user),
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
    if (key === 'member-review') {
      void wx.navigateTo({ url: '/pages/member-review/index' })
      return
    }
    if (key === 'categories') {
      void wx.navigateTo({ url: '/pages/category-select/index' })
      return
    }
    void wx.showToast({
      title: `${key ?? '功能'}模块待实现`,
      icon: 'none',
    })
  },
})

function getShortcuts(user: User): Shortcut[] {
  if (user.role === 'ADMIN' || user.role === 'OWNER') {
    return [
      ...memberShortcuts,
      {
        key: 'member-review',
        title: '成员审核',
        description: '处理新的组织加入申请',
      },
    ]
  }
  return memberShortcuts
}
