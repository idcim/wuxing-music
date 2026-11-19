# 安卓体验版

用户确认的首版用途是页面、后台风格切换与播放器体验。使用 Capacitor Android，页面资源内置在 APK 中，启动不依赖远程 H5 页面。H5 产品仍停止后续更新。

## 安装与使用

- 应用名称：五行律音体验版。
- 应用标识：`cn.azureglow.wuxing.preview`，与未来正式应用隔离。
- 最低 Android 7.0（API 24）；使用系统 WebView，建议保持 WebView 更新。
- 构建产物：`artifacts/android/wuxing-music-2.0.0-rc.2-android-preview.1.apk`，同目录附 `.sha256` 校验文件。
- 使用 Android debug 签名供本地安装体验，未做应用商店发布。debug 签名由本机 Android 工具管理，不进入仓库；换机器打包可能需要先卸载旧体验版。
- 图标与原生启动页使用用户提供的蓝底金色 LOGO，源文件随 Android 资源保存，后续打包不依赖原素材目录。

连接现有 API，默认 `https://app.azure-glow.cn`。后台修改品牌和风格后，重启应用或从后台切回应用会重新读取配置。课程、商城入口遵守后台展示开关。

支持游客浏览、音乐前台试听、播放器收展，以及课程商品展示。体验包登录页明确提示账号登录尚未开放，可以返回继续体验，不复用旧 H5 的默认同意登录流程。未新增安卓账号授权、支付、分享 SDK 或可靠的原生后台音乐服务；音乐会员、礼物卡和课程商城下单在体验包中关闭。不得将体验版验证视为这些原生能力验收。

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
