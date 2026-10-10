import { login } from '../../services/auth'
import { fetchTestAccessStatus, startTestSession } from '../../services/cloud-api'
import type { TextEntryModalInstance } from '../text-entry-modal/types'

/**
 * 审核测试入口：全局隐藏式入口，仅当服务端测试环境处于开启状态时渲染。
 * 平时完全不可见，避免普通用户看到测试相关功能。
 */
Component({
  data: {
    enabled: false,
    busy: false,
    errorMessage: '',
  },

  pageLifetimes: {
    show() {
      void this.loadStatus()
    },
  },

  methods: {
    async loadStatus() {
      try {
        const status = await fetchTestAccessStatus()
        this.setData({ enabled: status.enabled === true })
      } catch {
        // 查询失败一律视为未开启
        this.setData({ enabled: false })
      }
    },

    async handleOpen() {
      if (this.data.busy) {
        return
      }
      const modal = this.selectComponent(
        '#passwordModal',
      ) as unknown as TextEntryModalInstance | null
      if (!modal) {
        return
      }

      const password = await modal.open({
        title: '测试口令',
        placeholder: '请输入测试口令',
        confirmText: '进入',
        maxLength: 128,
      })
      if (password === null) {
        return
      }

      this.setData({ busy: true, errorMessage: '' })
      try {
        await startTestSession(password)
        const session = await login()
        getApp<IAppOption>().globalData.currentUser = session.user
        await wx.reLaunch({
          url:
            session.accessState === 'APPROVED'
              ? '/pages/home/index'
              : '/pages/access-pending/index',
        })
      } catch (error) {
        this.setData({
          errorMessage:
            error instanceof Error ? error.message : '测试口令验证失败',
        })
      } finally {
        this.setData({ busy: false })
      }
    },
  },
})
