# APP 身份与签名交接

记录日期：2026-11-20。公开证书参数与当前正式 APK 已交叉核对。

## 包名与渠道

| 项目 | 正式包 | 体验包 |
| --- | --- | --- |
| 安装后名称 | 五行律音 | 五行律音体验版 |
| 实际应用包名 / applicationId | `cn.azureglow.wuxing` | `cn.azureglow.wuxing.preview` |
| 更新渠道 | `stable` | `preview` |
| 签名 | 长期发布签名 | 本机 Android debug 签名 |
| 当前正式版本 | `2.0.0` / `2000006` | 上次交付为 `2.0.0-rc.3-android-preview.5` / `2000005` |
| 安装关系 | 与体验包并存 | 不能作为正式包覆盖更新 |

工程 `namespace` 仍为 `cn.azureglow.wuxing.preview`，用于内部 Java/R 资源定位；向后台、微信开放平台或应用商店登记时填写上表的**实际应用包名**。正式微信回调为 `cn.azureglow.wuxing.wxapi.WXEntryActivity`。

## 正式发布证书

以下是**签名证书**的指纹，使用小写、无冒号格式，便于复制到微信配置。APK 文件哈希另见版本档案。

| 项目 | 值 |
| --- | --- |
| 证书 MD5 | `453d82a42eac6bd24178c9f9ae6381cc` |
| 证书 SHA-1 | `53b38d023bb6c09cfda743116fb61679cb183aae` |
| 证书 SHA-256 | `eb928c18554b6ea174ca1f0e5ed976166e7a6dc434674b215270db1180ed1ea9` |
| 主题 / 颁发者 | `CN=WuxingMusic Android Release` |
| 证书序列号 | `C6E1FBCC70196FB2` |
| 有效期（北京时间） | 2026-11-20 02:25:34 至 2054-04-07 02:25:34 |
| 密钥类型 | RSA 3072 位 |
| 密钥别名 | `wuxing-release` |
| 密钥库格式 | PKCS12 |
| 公开证书文件 | [PEM](certificates/release-certificate.pem) / [DER CER](certificates/release-certificate.cer) |

可读 JSON 参数保存在 [release-certificate.json](release-certificate.json)。正式构建会对照其中的包名、MD5 和 SHA-256，防止用错签名；普通版本升级不修改这些值。

上次体验包证书 MD5 为 `48b1a4fe20e435e59ab91ce295ddb0e3`，仅适用于该本机 debug 签名，不用于正式包登记；换构建机后 debug 指纹可能不同。

## 签名材料实际保存位置

当前机器目录：`C:\Users\Administrator\.wuxing-music\android-signing\`，通用路径为 `%USERPROFILE%\.wuxing-music\android-signing\`。

| 文件 | 内容及使用方式 |
| --- | --- |
| `release.p12` | 正式私钥容器；后续所有正式更新沿用此文件 |
| `credentials.clixml` | 当前 Windows 用户通过 DPAPI 加密的别名与密码，发布脚本自动读取 |
| `release-certificate.pem` | 同一证书的公开导出；仓库内保存的是此公开证书的副本 |

目录权限仅允许当前 Windows 用户与 SYSTEM。密码不记录在本文件、源码、聊天或命令参数中；在当前账户打包不需要手工填写密码。

DPAPI 凭据绑定当前 Windows 用户和机器，单独复制 `credentials.clixml` 到新电脑不能恢复。迁移或重装前，由维护者在当前账户通过可信流程保管原私钥和可恢复凭据；**本次仅建立了本机保管，尚未执行异机恢复或异地备份**。丢失原签名不能靠新建证书维持原应用的覆盖更新。不要在已有签名的机器上重新初始化或删除该目录。

本仓库仅存公开证书和参数。私钥容器、密码和 DPAPI 凭据不复制进 APP 目录；相关私有文件扩展名已在 [忽略规则](.gitignore) 中排除。

## 后台与微信填写对照

| 位置 | 对应参数 |
| --- | --- |
| 后台「APP 管理 → 基础与下载」 | 安卓包名 `cn.azureglow.wuxing` |
| 后台「APP 管理 → 版本发布」 | 渠道 `stable`，上传后以 APK 解析的版本和哈希为准 |
| 后台「APP 管理 → 微信登录」 | 已审核的移动应用 AppID/AppSecret、正式包名和正式证书 MD5 |
| 微信开放平台的移动应用 | 登记相同正式包名和 MD5；本文件不代表微信侧已审核 |
| 正式下载固定页 | `https://app.azure-glow.cn/download?channel=stable`，需后台发布并开放下载后可用 |
| 后台「APP 管理 → 基础与下载 → APP 文件下载域名」 | 默认 `https://cdn.azure-glow.cn`；仅分发 OSS 中的 APK，修改后无需重新打包 |

AppID/AppSecret 是另外的微信应用配置，不是 APK 签名参数；其实际值在后台维护，不记入本档案。当前后台只有一套 APP 微信参数，切换正式参数后不能把旧体验包的包名或 debug 指纹混用。

## 工程与运行信息

- 页面：Taro 4.3.1、React 18；安卓容器为 Capacitor，当前不是 React Native 工程。
- 最低 Android 7.0 / API 24，目标及编译 API 36；运行依赖系统 WebView。
- 默认 API 根地址：`https://app.azure-glow.cn`；构建覆盖项为 `TARO_APP_ANDROID_API_BASE`，不包含密钥。
- 正式包关闭调试。短信登录、微信绑定、风格和内容沿用后台配置；微信授权需匹配正式证书。
- 当前 APP 原生支付与可靠原生后台播放仍未开放；正式签名不代表新增这些能力。
- 本次本地已核对签名、安装、冷启动动画及关闭动画回退；微信真授权、应用商店审核等状态以实际验收为准，不能从此档案推断完成。
