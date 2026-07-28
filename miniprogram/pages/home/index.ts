Page({
  data: {
    shortcuts: [
      { key: 'scan', title: '扫码查询', description: '扫描物品上的小程序码' },
      { key: 'search', title: '文字搜索', description: '按名称或详情查找物品' },
      { key: 'create', title: '登记物品', description: '录入信息并绑定实体标签' },
      { key: 'requests', title: '申请中心', description: '查看加入与离库申请' },
    ],
  },

  handleShortcut(event: WechatMiniprogram.BaseEvent) {
    const key = event.currentTarget.dataset['key'] as string | undefined
    void wx.showToast({
      title: `${key ?? '功能'}模块待实现`,
      icon: 'none',
    })
  },
})
