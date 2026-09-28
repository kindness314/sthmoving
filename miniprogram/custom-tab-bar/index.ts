import { getThemeStyle } from '../services/theme'

Component({
  data: {
    selected: 0,
    themeStyle: getThemeStyle(),
  },

  methods: {
    syncState(selected: number) {
      this.setData({ selected, themeStyle: getThemeStyle() })
    },

    handleSwitch(event: WechatMiniprogram.BaseEvent) {
      const url = event.currentTarget.dataset['url'] as string | undefined
      if (!url) {
        return
      }
      void wx.switchTab({ url })
    },
  },
})
