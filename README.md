# sthmoving

单组织共享物品管理微信小程序。产品需求与架构见[产品需求与架构.md](./产品需求与架构.md)。

## 技术栈

- 微信原生小程序 + TypeScript
- 微信云开发
- Vitest
- ESLint

## 本地准备

1. 安装依赖：`npm install`
2. 将官方 `SupvanT50ProWeChat.zip` 放到 `%LOCALAPPDATA%\Temp`，执行
   `npm run install:supvan-sdk` 安装本机打印 SDK。
3. 将 `project.private.config.example.json` 复制为
   `project.private.config.json`，并填写实际微信小程序 AppID。
4. 把 `miniprogram/config/env.ts` 中的 `apiBaseUrl` 改成后端实际域名，并在微信后台把
   该域名加入 request 与 downloadFile 合法域名。
5. 使用微信开发者工具打开项目根目录。
6. 执行 `npm run check` 验证代码。

仓库中的 `project.config.json` 使用游客 AppID；实际 AppID 只保存在被
`.gitignore` 排除的 `project.private.config.json` 中。后端域名是客户端运行所需的公开标识。
AppSecret、访问令牌及云密钥不得写入小程序代码或提交到仓库。

提交前执行 `npm run check`。该命令会先扫描仓库文件中的常见凭据模式，
再运行 ESLint、TypeScript 类型检查和自动化测试；GitHub CI 会执行相同检查。

阶段 1 的数据库集合、索引、首位所有者初始化和人工验收步骤见
[阶段 1 云环境配置](./docs/阶段1云环境配置.md)。

阶段 2 分类批次的集合、索引、部署和人工验收步骤见
[阶段 2 分类云环境配置](./docs/阶段2分类云环境配置.md)。

阶段 3 物品查询批次的索引、部署和人工验收步骤见
[阶段 3 物品查询云环境配置](./docs/阶段3物品查询云环境配置.md)。

阶段 3 小程序码批次的集合、索引、云调用权限和人工验收步骤见
[阶段 3 小程序码云环境配置](./docs/阶段3小程序码云环境配置.md)。

## 自建后端

`server/` 是正在迁移中的自建后端，与云函数共用 `cloudfunctions/api/src` 下的
业务代码，只替换仓储与外部依赖的实现。

启动开发环境：

```
docker compose -f docker-compose.dev.yml up
```

服务监听 8080 端口，端点如下：

| 端点 | 鉴权 | 说明 |
|---|---|---|
| `GET /health` | 无 | 数据库连通状态 |
| `POST /auth/session` | 无 | 用 `{code}` 换取访问令牌 |
| `POST /api` | Bearer 令牌 | 与云函数相同的 `{module, action, payload}` |
| `POST /files/uploads` | Bearer 令牌 | 申请上传，返回文件引用和带签名的上传地址 |
| `PUT /files/<路径>` | 上传签名 | 写入图片，只接受 JPEG、PNG、WebP |
| `GET /files/<路径>` | 下载签名 | 读取图片 |

访问令牌是随机串，服务端只保存它的 SHA-256 摘要；权限每次请求都回数据库查，成员
被停用后立即失效，不必等令牌过期。

文件一律走签名地址，没有任何一条路径可以裸取。签名覆盖路径、用途和过期时间，
下载签名不能用来覆盖文件。物品图片和头像的引用形如 `file://items/<用户>/<随机>.jpg`，
上传时按内容首字节判定真实格式，压不进白名单的内容直接拒绝。可用的环境变量：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | 8080 | 监听端口 |
| `DATABASE_URL` | 无，必填 | PostgreSQL 连接串 |
| `DATABASE_POOL_MAX` | 10 | 连接池上限 |
| `RUN_MIGRATIONS` | true | 启动时执行 `server/migrations` |
| `MIGRATIONS_DIR` | `<工作目录>/server/migrations` | 迁移脚本目录 |
| `SESSION_TTL_DAYS` | 30 | 访问令牌有效期 |
| `WECHAT_APP_ID` | 无，必填 | 小程序 AppID |
| `WECHAT_APP_SECRET` | 无，必填 | 小程序密钥，只允许放在服务端环境变量 |
| `PUBLIC_BASE_URL` | 无，必填 | 对外访问地址，用于拼接文件地址 |
| `STORAGE_ROOT` | storage | 文件存储根目录 |
| `FILE_SIGNING_SECRET` | 无，必填 | 文件地址签名密钥，至少 32 位 |
| `FILE_URL_TTL_SECONDS` | 600 | 下载地址有效期 |
| `UPLOAD_URL_TTL_SECONDS` | 300 | 上传地址有效期 |
| `MINI_PROGRAM_ENVIRONMENT` | release | 小程序码指向的版本，可选 develop、trial、release |
| `OWNER_BOOTSTRAP_TOKEN` | 无 | 首位所有者初始化口令，至少 16 位 |

生产部署（Dockerfile + Caddy + 微信后台配置 + 备份）见
[自建后端部署](./docs/自建后端部署.md)，把线上流量从云开发切过来的维护窗口步骤、
验收清单和回滚方案见 [切换到自建后端](./docs/切换到自建后端.md)。

只跑数据库时使用 `docker compose -f docker-compose.test.yml up -d`，并把
`TEST_DATABASE_URL` 指向它，`npm run test` 才会执行真实数据库用例；未配置时这些
用例自动跳过。

## 从微信云开发迁移数据

先执行 `npm run build:server`，随后：

1. 在微信云开发控制台把 7 个集合导出为 JSON Lines，文件按集合命名放进同一个目录，
   例如 `users.jsonl`、`items.jsonl`。
2. `npm run migrate -- check <导出目录>` 校验。它会逐条报出字段格式、枚举、长度、唯一性
   和孤儿引用问题，也会核对 `_id` 是否等于 `openid` 的摘要——不等说明小程序 AppID 变过，
   这种数据不能直接导入。
3. `npm run migrate -- plan-files <导出目录> manifest.json` 生成云存储文件搬迁清单。
   新路径由文件 ID 的摘要推导，同一份导出反复执行结果一致。
4. 按清单把云存储文件下载到 `STORAGE_ROOT` 下的对应路径。
5. `DATABASE_URL=... STORAGE_ROOT=... npm run migrate -- import <导出目录>` 导入。
   它先确认清单里的文件都已到位，缺一个就终止；随后在一个事务里用主键 UPSERT 写入
   全部记录，逐表比对数量，最后按实际文件大小登记 `files` 表。整个过程可以重复执行。

导入会把记录里的 `cloud://` 引用重写成 `file://`，与第 3 步的清单一一对应。`files` 表
决定图片以什么 Content-Type 返回，跳过第 4 步会导致导入失败而不是悄悄给出坏图片。

`scripts/backup.sh <备份目录>` 打包数据库与文件卷，`scripts/restore.sh <备份目录>` 反向恢复；
恢复会覆盖现有数据，默认需要交互确认，`FORCE=yes` 可跳过。

## 当前实现范围

- 微信登录、成员申请与审核
- 分类选择、自定义分类和管理员分类管理
- 物品登记、图片上传和首条操作日志
- 物品列表、文字搜索、分类筛选和详情
- 微信小程序码生成、云存储、标签预览和扫码路由
- 硕方 T50 Pro 蓝牙搜索、连接、断开、错误映射和 30 × 30 mm 标签打印入口

硕方 SDK 本体没有提交到公有仓库，通过固定 SHA256 的安装脚本放入本机 Git
忽略目录。真机打印、参数校准和连续 20 张验收步骤见
[阶段 8 硕方 T50 Pro 打印验收](./docs/阶段8硕方T50Pro打印验收.md)。
