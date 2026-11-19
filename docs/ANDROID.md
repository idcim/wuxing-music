# 安卓体验版

用户确认的首版用途是页面、后台风格切换与播放器体验。使用 Capacitor Android，页面资源内置在 APK 中，启动不依赖远程 H5 页面。H5 产品仍停止后续更新。

## 安装与使用

- 应用名称：五行律音体验版。
- 应用标识：`cn.azureglow.wuxing.preview`，与未来正式应用隔离。
- 最低 Android 7.0（API 24）；使用系统 WebView，建议保持 WebView 更新。
- 构建产物：`artifacts/android/wuxing-music-2.0.0-rc.3-android-preview.4.apk`，同目录附 `.sha256` 校验文件。
- 使用 Android debug 签名供本地安装体验，未做应用商店发布。debug 签名由本机 Android 工具管理，不进入仓库；换机器打包可能需要先卸载旧体验版。
- 图标与原生启动页使用用户提供的蓝底金色 LOGO，源文件随 Android 资源保存，后续打包不依赖原素材目录。

连接现有 API，默认 `https://app.azure-glow.cn`。后台修改品牌和风格后，重启应用或从后台切回应用会重新读取配置。课程、商城入口遵守后台展示开关。

APP 页面不预留微信胶囊空间。后续页面统一使用 `navTopStyle()`（设备安全区加 32rpx 页面间距）或 `navBarStyle()`（设备安全区加实际 44px 导航行）；安全区优先采用原生容器注入值，避免重复增加状态栏高度。小程序胶囊避让和旧 H5 间距各自保留。

版本发布、公开下载与移动应用微信配置见 [APP 管理](APP-MANAGEMENT.md)。当前 versionCode 为 `2000004`，支持启动/回前台及设置页检查更新。

支持游客浏览、音乐前台试听、播放器收展，以及课程商品展示。APP 登录页接入微信移动应用原生授权，须在后台 APP 管理的「微信登录」填写并开启；用户自行勾选协议，允许拒绝或返回游客体验，不复用旧 H5 网站扫码流程。未新增安卓支付、分享 SDK 或可靠的原生后台音乐服务；音乐会员、礼物卡和课程商城下单在体验包中关闭。不得将体验版验证视为这些原生能力验收。

## 重新构建

需要 Node.js 22+、Java 21、Android SDK 36 与 Build Tools。首次安装依赖后执行：

```powershell
npm ci
npm run type-check
npm run build:android
```

脚本会构建到独立目录 `dist-android/`、同步原生资源、执行 `assembleDebug`、复制 APK 并生成 SHA256。不会覆盖小程序 `dist/` 或 H5 `dist-h5/`。Android 工程、构建产物和私有签名材料分别管理；`local.properties`、Gradle 缓存、APK 和凭证不得提交。

Windows 未指定 JAVA_HOME 时会尝试 Android Studio 自带的 `jbr`；SDK 默认取 `%LOCALAPPDATA%/Android/Sdk`。也可设置 JAVA_HOME、ANDROID_HOME。替换服务端只需在本次构建进程设置公开地址：

```powershell
$env:TARO_APP_ANDROID_API_BASE='https://api.example.com'
npm run build:android
```

只编译页面资源使用 `npm run build:android:web`。Android 通过 CapacitorHttp 发起现有 API 请求；保留 HTTPS 校验，不关闭证书校验，不为本地 WebView 放宽生产 CORS。

## 本机构建环境排障

- Windows 桌面进程下 Java 出现 `Unable to establish loopback connection` 时，可在当前构建进程设置 `$env:JAVA_TOOL_OPTIONS='-Djdk.net.unixdomain.tmpdir=C:\Windows\Temp'`，不修改全局 Java 配置。
- 用户原有 Gradle 脚本缓存损坏时使用独立 `GRADLE_USER_HOME`；不清除其他项目缓存。
- Google Maven 网络不可达时，可通过 `WUXING_GRADLE_INIT_SCRIPT` 指定本机的 Gradle 仓库配置。它只用于本机构建，不改变仓库默认的官方依赖源。不得通过关闭 TLS 验证解决连接问题。

官方参考：[Capacitor Android](https://capacitorjs.com/docs/android)、[原生 HTTP](https://capacitorjs.com/docs/apis/http)、[Java 本地套接字目录](https://docs.oracle.com/en/java/javase/21/core/java-core-libraries-developer-guide.pdf)。

## 验证清单

类型检查、小程序回归构建、安卓打包、会员与礼物支付拦截、商城下单拦截及配置隔离需要每次检查。模拟器内另检查冷启动、游客浏览、协议未预选、硬件返回、音乐试听与收展、两种风格；主题对照不得直接改生产后台。支付、退款、锁屏续播、通知栏控制、正式签名与应用商店发布另行验收。

### 2026-11-19 本地验收

- 类型检查、小程序构建、安卓 APK 构建及签名校验通过；`node --test scripts/tests/android-preview.test.cjs scripts/tests/member-sale-gate.test.cjs` 的 6 项检查通过。
- 已安装至 MuMu（Android 15）：游客首页、五栏导航、课程和商城列表、前台音乐真实播放、播放器展开与收起、游客登录说明及安卓返回键通过；验证过程中未捕获 JavaScript 异常。
- 在已安装应用中通过本地接口响应替身验证 `starlight → chinese_classic → starlight`，未改动生产后台配置。真实后台改风格后重新进入应用的联动仍需运营环境复核。
- APK、截图及本次界面检查结果保存在忽略的 `artifacts/android/`，不进入源代码仓库。

### APP 页头复核（preview.3）

- 移除 APP 沿用的 88rpx 顶部留白，首页与「我的」改为 32rpx；二级页面保留实际 44px 导航行。设备状态栏安全区独立处理，小程序布局不变。
- 类型检查、小程序构建、安卓打包及 12 项相关测试通过。已覆盖安装到 MuMu（Android 15），复核首页、课程、商城、我的、设置、关于、五行详情、播放器和登录页；返回操作正常，未捕获 JavaScript 异常。
- 本地响应替身验证星夜与中国古风切换；临时注入 24px 安全区时，页头正确增加对应高度并可恢复。未修改生产配置，其他设备刘海/横屏仍需实机复核。


### 2026-11-20 品牌视觉复核（preview.4）

- 引导页改为适配短屏的自然布局，顶部与底部保留安全间距；关于页、桌面图标及启动图标增加 LOGO 留白，保留原始图片。
- 课程与商城共用品牌页头、编辑式海报、内容分区和主题卡片；课程列表/详情/学习/我的课堂、商品列表/详情，以及购物车/结算/地址/订单/物流/售后形成一致系列。品牌名称、副标题与 LOGO 跟随后台设置。
- 类型检查、微信小程序构建、安卓构建和 78 项前端测试通过。已覆盖安装到 MuMu Android 15，完成 21 个页面/状态检查：星夜与中国古风切换、规格切换报价展示、购物车勾选金额、游客免费试听、空状态、协议选择样式、物流时间线，以及 360×480 短屏引导页。未发现横向溢出或 JavaScript 异常。
- 课程、商品、订单与地址为仅在模拟器内存中替换的演示数据；相关请求均本地拦截，未创建生产订单、修改正式商品或发生支付。保留原有支付与权益验证结论，本轮不宣称新增真实渠道验收。
- 最新包为 `2.0.0-rc.3-android-preview.4`，versionCode `2000004`。图片与检查记录保存在忽略的 `artifacts/android/screenshots/brand-*.png`、`artifacts/android/branded-qa.json`。


## APP 微信登录配置与验证范围

- 在后台「APP 管理 → 微信登录」填写微信开放平台已审核的**移动应用** AppID/AppSecret、安卓包名及 APK 签名证书 MD5。网站扫码应用、小程序及公众号凭据不能代替移动应用凭据。
- 签名需与用户实际安装包一致；debug 体验包与未来 release 包须分别核验。iOS Bundle ID 仅预留，当前未生成 iOS 原生工程。
- 后台维护 APP 隐私政策正文；在登录前可打开服务协议、隐私政策阅读。未完整填写配置或隐私政策时登录关闭，游客浏览保留。
- AppSecret 仅保存服务端；回读只返回已填写标记、留空保留，APP 仅持有公开 AppID 与自身包名、签名 MD5。
- 原生 SDK 在用户勾选协议并主动点击后初始化。服务端生成五分钟一次性校验、使用微信 code 换身份；微信返回 unionid 时沿用小程序/H5 账号归并。APP 身份不会作为小程序支付 OpenID，也不会进入早期游客测试号清理列表。
- 本地自动验证覆盖默认不选、未开启、拒绝/取消可继续游客、SDK state 不匹配、重复点击、配置脱敏、服务端权限、网络错误、无效微信 code、校验过期与重放、账号复用及注销后重新登录；实际 SDK 授权仍需已审核移动应用与匹配真实包名/签名的微信客户端联调。当前未将编译通过视为真实微信登录通过。

官方文档：[微信 Android 接入](https://developers.weixin.qq.com/doc/oplatform/Mobile_App/Access_Guide/Android.html)、[移动应用微信登录](https://developers.weixin.qq.com/doc/oplatform/Mobile_App/WeChat_Login/Development_Guide.html)、[Capacitor Android 插件](https://capacitorjs.com/docs/plugins/android)。
