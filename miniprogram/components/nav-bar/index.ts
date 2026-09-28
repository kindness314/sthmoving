Component({
  properties: {
    title: {
      type: String,
      value: '',
    },
    showBack: {
      type: Boolean,
      value: true,
    },
    showHome: {
      type: Boolean,
      value: true,
    },
  },

  data: {
    statusBarHeight: 0,
  },

  lifetimes: {
    attached() {
      const systemInfo = wx.getSystemInfoSync()
      this.setData({ statusBarHeight: systemInfo.statusBarHeight ?? 0 })
    },
  },

  methods: {
    handleBack() {
      if (getCurrentPages().length > 1) {
        void wx.navigateBack({ delta: 1 })
        return
      }
      void wx.switchTab({ url: '/pages/home/index' })
    },

    handleHome() {
      void wx.switchTab({ url: '/pages/home/index' })
    },
  },
})
