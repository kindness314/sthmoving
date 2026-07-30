# sthmoving

单组织共享物品管理微信小程序。产品需求与架构见[产品需求与架构.md](./产品需求与架构.md)。

## 技术栈

- 微信原生小程序 + TypeScript
- 微信云开发
- Vitest
- ESLint

## 本地准备

1. 安装依赖：`npm install`
2. 将 `project.private.config.example.json` 复制为
   `project.private.config.json`，并填写实际微信小程序 AppID。
3. 确认 `miniprogram/config/env.ts` 中的云环境 ID 与当前微信云开发环境一致。
4. 使用微信开发者工具打开项目根目录。
5. 执行 `npm run check` 验证代码。

仓库中的 `project.config.json` 使用游客 AppID；实际 AppID 只保存在被
`.gitignore` 排除的 `project.private.config.json` 中。云环境 ID 是客户端运行所需的公开标识。
AppSecret、访问令牌及云密钥不得写入小程序代码或提交到仓库。

提交前执行 `npm run check`。该命令会先扫描仓库文件中的常见凭据模式，
再运行 ESLint、TypeScript 类型检查和自动化测试；GitHub CI 会执行相同检查。

阶段 1 的数据库集合、索引、首位所有者初始化和人工验收步骤见
[阶段 1 云环境配置](./docs/阶段1云环境配置.md)。

阶段 2 分类批次的集合、索引、部署和人工验收步骤见
[阶段 2 分类云环境配置](./docs/阶段2分类云环境配置.md)。

阶段 3 物品查询批次的索引、部署和人工验收步骤见
[阶段 3 物品查询云环境配置](./docs/阶段3物品查询云环境配置.md)。

## 当前实现范围

- 微信登录、成员申请与审核
- 分类选择、自定义分类和管理员分类管理
- 物品登记、图片上传和首条操作日志
- 物品列表、文字搜索、分类筛选和详情
- 小程序码服务边界和 T50 Pro 打印机适配接口

硕方 SDK 尚未接入。取得 SDK 和设备后，只在 `miniprogram/services/printer/adapters/supvan-t50-pro/` 实现真实适配器。
