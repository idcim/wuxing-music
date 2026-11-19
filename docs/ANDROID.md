# 安卓 APP 构建与安装

包名、签名指纹、公开证书、版本及更新交接集中保存在 [android/README.md](../android/README.md)。

页面使用 Taro 构建，现有 Android 容器为 Capacitor，资源内置于 APK；H5 产品停止后续更新。当前支持正式签名 release 与 debug 体验包两个构建，功能仍沿用现有 APP 实现。

## 安装与使用

- 正式应用名称：五行律音；包名 `cn.azureglow.wuxing`，更新渠道 `stable`。
- 体验包保留 `cn.azureglow.wuxing.preview`，更新渠道 `preview`；两者可并存，不覆盖安装或迁移本地缓存，登录后使用同一后端账号。
- 最低 Android 7.0（API 24）；使用系统 WebView，建议保持 WebView 更新。
- 正式产物：`artifacts/android/wuxing-music-2.0.1-android-release.apk`，附 SHA256、包名/版本/公开证书摘要 JSON。
- 正式包使用独立长期发布签名，关闭调试；体验包继续使用 debug 签名。生成 release APK 不等于已上架应用商店或发布下载。
- 启动 LOGO 沿原图轮廓拆成三个矢量部件，Android 12+ 播放约 3 秒的双向光轨、金线汇聚与火焰合成动画；原始 JPG 保留。旧系统及关闭动画时显示完整静态标识，APP 不再追加旧月亮等待页。

连接现有 API，默认 `https://app.azure-glow.cn`。后台修改品牌和风格后，重启应用或从后台切回应用会重新读取配置。课程、商城入口遵守后台展示开关。

APP 页面不预留微信胶囊空间。后续页面统一使用 `navTopStyle()`（设备安全区加 32rpx 页面间距）或 `navBarStyle()`（设备安全区加实际 44px 导航行）；安全区优先采用原生容器注入值，避免重复增加状态栏高度。小程序胶囊避让和旧 H5 间距各自保留。

版本发布、公开下载与移动应用微信配置见 [APP 管理](APP-MANAGEMENT.md)。当前 versionCode 为 `2000007`，支持启动/回前台及设置页检查更新。`2.0.1` 的协议勾选修复与验证见 [版本记录](../android/RELEASES.md)。APP 样式若需命中 Taro 内部原生标签，使用类或属性选择器：直接写 `label` 会被编译为 `taro-label-core`，不能命中其内部的 `<label>`。

支持短信登录、绑定微信、游客浏览、音乐前台试听、播放器收展及课程商品展示。微信移动应用原生授权须在后台及微信开放平台登记实际包名、证书后开启；协议自主勾选，允许返回游客。正式签名不增加原生支付、分享 SDK 或可靠后台音乐服务，APP 音乐会员、礼物卡及课程商城下单仍关闭，不能把发布构建当成这些能力已验收。

## 重新构建

需要 Node.js 22+、Java 21、Android SDK 36 与 Build Tools。首次安装依赖后执行：

```powershell
npm ci
npm run type-check
npm run build:android
```

`build:android` 生成 debug 体验包；本机正式签名已建立后执行 `npm run build:android:release`。脚本构建独立的 `dist-android/`，同步原生资源并执行对应构建任务；release 校验签名、正式包名、版本及非调试标记后才交付 APK。缺签名时拒绝，不回退至 debug 签名。小程序与 H5 产物目录不受影响。

Windows 发布签名保存在 `%USERPROFILE%/.wuxing-music/android-signing/`。`release.p12` 为私钥容器，`credentials.clixml` 为当前用户的 DPAPI 加密凭据，`release-certificate.pem` 只含公开证书；目录 ACL 仅允许当前用户与 SYSTEM。首次创建必须显式执行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-android-release.ps1 -InitializeSigning`，已有文件时拒绝覆盖。密码仅短暂传给构建子进程，结束清理，不写参数或日志。

长期更新必须沿用同一发布签名。DPAPI 凭据仅当前 Windows 用户在本机可解密；不能仅复制 clixml 到其他电脑恢复。应由维护者通过可信保管流程备份签名与可恢复凭据，不能删除用户配置目录、把密钥提交 Git 或上传聊天。CI/Linux 可在其保密环境注入 `WUXING_ANDROID_STORE_FILE/STORE_PASSWORD/KEY_ALIAS/KEY_PASSWORD` 后调用 `node scripts/build-android.cjs --release`。

Windows 未指定 JAVA_HOME 时会尝试 Android Studio 自带的 `jbr`；SDK 默认取 `%LOCALAPPDATA%/Android/Sdk`。也可设置 JAVA_HOME、ANDROID_HOME。替换服务端只需在本次构建进程设置公开地址：

```powershell
$env:TARO_APP_ANDROID_API_BASE='https://api.example.com'
npm run build:android
```

只编译页面资源使用 `npm run build:android:web`。Android 通过 CapacitorHttp 发起现有 API 请求；保留 HTTPS 校验，不关闭证书校验，不为本地 WebView 放宽生产 CORS。

## 2026-11-20 正式包与开屏验证

- `2.0.0` / versionCode `2000006` 的 release 构建、签名验证、公开证书指纹校验、包名与非调试检查通过，已在 MuMu Android 15 安装及覆盖安装。APK SHA256：`8c86a22785dcd602dd04d4507ac03f5b60192a1e50e74a8f726715116e6b611d`。
- 93 项前端回归、类型检查与小程序构建通过。Android 仪器测试覆盖静态位图和动画定格矢量在 144/288/864 像素边界内的安全圆；原固定 dp 图层在 144 边界失败，修复后通过。
- 原生冷启动录屏确认三个部件合成、双向光轨、收尾闪光与完整定格，随后进入引导页并可作为游客进入首页；关闭系统动画时展示完整静态 LOGO 且不强留动画时长。动画正常速度约 3 秒，原生等待最多约 3.15 秒，与 WebView 初始化并行。
- MuMu 原有动画缩放为 0.5，本轮临时使用 1 与 0 检查正常及关闭动画，测试后已恢复为 0.5；不改用户系统偏好。旧安卓回退仅验证资源与构建，未在旧 API 设备运行。未发送短信、授权微信、支付、上传 OSS 或发布下载。
- 冷启动录屏、截图及 `splash-animation-preview.gif` 保存在忽略的 `artifacts/android/`。系统开屏约束参考 [Android 启动画面](https://developer.android.com/develop/ui/views/launch/splash-screen)，签名流程参考 [Android 应用签名](https://developer.android.com/studio/publish/app-signing)。

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

### 2026-11-20 短信登录与微信绑定（preview.5）

- APP 新增手机号与六位验证码登录，发送中防重复、60 秒重发倒计时，沿用后台短信设置。登录后的「我的」显示微信绑定与已绑定状态；服务端验证绑定归属，保留当前账号与权益。
- 92 项前端测试、202 项后端测试（跳过 1 项需独立 MySQL 的可选测试）、26 项部署备份脚本测试、类型检查、后端编译、小程序与安卓构建通过。新增身份字段迁移在隔离 SQLite 预演；本轮未运行真实 MySQL 迁移。
- MuMu Android 15 覆盖安装，使用仅在本机拦截的响应验证协议默认不选、同意前不发码/登录、发码防重与倒计时、游客返回、绑定入口、取消不发起微信授权、已绑定展示与两种主题。未发送真实短信或执行真实微信授权；这些仍需配置后联调。截图与检查结果在忽略的 `artifacts/android/`。
- 当前体验包 versionCode 为 `2000005`；源码推送不会自动把 APK 上传 OSS 或发布下载版本。

- 在后台「APP 管理 → 微信登录」填写微信开放平台已审核的**移动应用** AppID/AppSecret、安卓包名及 APK 签名证书 MD5。网站扫码应用、小程序及公众号凭据不能代替移动应用凭据。
- 签名需与用户实际安装包一致；debug 体验包与未来 release 包须分别核验。iOS Bundle ID 仅预留，当前未生成 iOS 原生工程。
- 后台维护 APP 隐私政策正文；在登录前可打开服务协议、隐私政策阅读。未完整填写配置或隐私政策时登录关闭，游客浏览保留。
- AppSecret 仅保存服务端；回读只返回已填写标记、留空保留，APP 仅持有公开 AppID 与自身包名、签名 MD5。
- 原生 SDK 在用户勾选协议并主动点击后初始化。服务端生成五分钟一次性校验、使用微信 code 换身份；微信返回 unionid 时沿用小程序/H5 账号归并。APP 身份不会作为小程序支付 OpenID，也不会进入早期游客测试号清理列表。
- 本地自动验证覆盖默认不选、未开启、拒绝/取消可继续游客、SDK state 不匹配、重复点击、配置脱敏、服务端权限、网络错误、无效微信 code、校验过期与重放、账号复用及注销后重新登录；实际 SDK 授权仍需已审核移动应用与匹配真实包名/签名的微信客户端联调。当前未将编译通过视为真实微信登录通过。

官方文档：[微信 Android 接入](https://developers.weixin.qq.com/doc/oplatform/Mobile_App/Access_Guide/Android.html)、[移动应用微信登录](https://developers.weixin.qq.com/doc/oplatform/Mobile_App/WeChat_Login/Development_Guide.html)、[Capacitor Android 插件](https://capacitorjs.com/docs/plugins/android)。
