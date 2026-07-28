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
3. 将 `miniprogram/config/env.ts` 中的 `YOUR_CLOUD_ENV_ID` 替换为云环境 ID。
4. 使用微信开发者工具打开项目根目录。
5. 执行 `npm run check` 验证代码。

`project.config.json` 当前使用 `touristappid`，接入云开发前必须替换为实际小程序 AppID。密钥不得写入小程序代码或提交到仓库。

## 当前框架范围

- 登录、待审核、首页页面骨架
- 用户、物品、分类、离库和标签领域类型
- 云函数 API 路由骨架
- 小程序码服务边界
- T50 Pro 打印机适配接口
- 权限、数量、提交梗概和打印任务校验

硕方 SDK 尚未接入。取得 SDK 和设备后，只在 `miniprogram/services/printer/adapters/supvan-t50-pro/` 实现真实适配器。

