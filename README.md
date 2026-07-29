# sthmoving

单组织共享物品管理微信小程序。产品需求与架构见[产品需求与架构.md](./产品需求与架构.md)。

## 技术栈

- 微信原生小程序 + TypeScript
- 微信云开发
- Vitest
- ESLint

## 本地准备

1. 安装依赖：`npm install`
2. 复制并填写微信开发者工具的私有项目配置。
3. 确认 `miniprogram/config/env.ts` 中的云环境 ID 与当前微信云开发环境一致。
4. 使用微信开发者工具打开项目根目录。
5. 执行 `npm run check` 验证代码。

项目已配置实际小程序 AppID 和云环境 ID。它们是公开标识，不是密钥；AppSecret、访问令牌及云密钥不得写入小程序代码或提交到仓库。

## 当前框架范围

- 登录、待审核、首页页面骨架
- 用户、物品、分类、离库和标签领域类型
- 云函数 API 路由骨架
- 小程序码服务边界
- T50 Pro 打印机适配接口
- 权限、数量、提交梗概和打印任务校验

硕方 SDK 尚未接入。取得 SDK 和设备后，只在 `miniprogram/services/printer/adapters/supvan-t50-pro/` 实现真实适配器。
