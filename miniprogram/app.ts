function applyPendingUpdate(): void {
  if (typeof wx.getUpdateManager !== 'function') {
    return
  }
  const manager = wx.getUpdateManager()
  manager.onUpdateReady(() => {
    wx.showModal({
      title: '版本更新',
      content: '新版本已下载完成，重启后生效',
      showCancel: false,
      success: () => manager.applyUpdate(),
    })
  })
}

App<IAppOption>({
  globalData: {
    currentUser: null,
  },
  onLaunch() {
    applyPendingUpdate()
  },
})
