# 业务模块边界

后续按以下模块逐步增加 handler，并在 `router.ts` 注册：

- `auth`：微信身份登录、加入申请、重新申请；
- `membership`：成员审核、角色和状态管理；
- `items`：物品登记、查询、乐观锁更新、操作日志；
- `categories`：预设分类与自定义分类；
- `outbound`：离库申请状态查询、审核、直接/批量离库、单件/批量重新入库和已离库数据删除；
- `labels`：小程序码生成、标签绑定与作废。

每个模块导出 `createXxxHandlers(deps: ApiDependencies)`，由 `createRouter(deps)` 统一装配；
`dependencies.ts` 只声明端口类型，`dependencies.cloud.ts` 负责绑定云开发实现。

所有写操作必须在服务端读取微信上下文并检查成员状态、角色和当前数据版本，
不能信任客户端传入的用户 ID 或权限。
