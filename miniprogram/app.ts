import { cloudEnvId } from './config/env'

App<IAppOption>({
  globalData: {
    currentUser: null,
  },
  onLaunch() {
    wx.cloud.init({
      env: cloudEnvId,
      traceUser: true,
    })
  },
})
