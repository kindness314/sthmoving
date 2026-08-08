# 硕方 T50 Pro 适配层

本目录封装硕方原生微信小程序 SDK，业务页面只依赖 `PrinterAdapter`，
不直接调用厂商蓝牙或打印 API。

## SDK 固定版本

- 官方下载页：<https://www.supvan.com/services4>
- 文件名：`SupvanT50ProWeChat.zip`
- SHA256：`97A3D04A7AACC4F246311E7562B9C4946929A5CBAC42EB83962C09A14890419C`

厂商包没有给出可识别的语义版本号，因此使用压缩包 SHA256 固定版本。
SDK 未附带明确的再分发许可证，且官方下载页提示下载文件内包含序列号，
所以 SDK 本体只安装到被 Git 忽略的本机目录，不提交至公有仓库。

在 Windows 上执行：

```powershell
npm run install:supvan-sdk
```

脚本默认读取：
`%LOCALAPPDATA%\Temp\SupvanT50ProWeChat.zip`。

## 当前接入

- `runtime.ts` 是唯一加载厂商 SDK 的入口；
- `adapter.ts` 封装搜索、停止搜索、连接、断开、打印和停止打印；
- 微信返回的 HTTPS 小程序码原图通过 SDK `doPrintImage` 打印；
- 标签参数固定为 30 × 30 mm、间隙纸、3 mm 间隙；
- SDK `101-135` 结果码转换为稳定的业务错误。

真机到货后仍需验证 iOS/Android 连接、浓度、偏移、连续 20 张打印和扫码
距离；没有实机结果前不能宣称打印验收通过。
