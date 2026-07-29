import { organizationName } from '../../config/env'
import { login } from '../../services/auth'

Page({
  data: {
    organizationName,
    loading: false,
    errorMessage: '',
  },

  async handleLogin() {
    this.setData({ loading: true, errorMessage: '' })
    try {
      const session = await login()
      getApp<IAppOption>().globalData.currentUser = session.user
      const target =
        session.accessState === 'APPROVED'
          ? '/pages/home/index'
          : '/pages/access-pending/index'
      await wx.reLaunch({ url: target })
    } catch (error) {
      const message = error instanceof Error ? error.message : '登录失败'
      this.setData({ errorMessage: message })
    } finally {
      this.setData({ loading: false })
    }
  },
})
