# Android APP 微信登录设计与实施

用户已授权实现 APP 原生微信登录，并在后台维护微信开放平台移动应用配置。

- 独立移动应用 AppID/AppSecret，不复用网站扫码应用；密钥只在服务端保存并脱敏回读。
- 后台位于 APP 管理的微信登录设置，权限 apps:view/apps:edit。填写包名、APK 签名 MD5、iOS Bundle ID，未完整配置不开放。
- Android Capacitor 本地插件封装微信官方 SDK；用户主动勾选协议后才启动授权。允许取消、拒绝、返回及继续游客体验，不自动弹登录。
- 服务端一次性 state 与 proof 持久化在 Setting，五分钟过期、原子消费；服务端用 code 换取微信身份，忽略客户端身份。沿用用户 JWT、unionid 账号合并和权益。
- APP OpenID 使用 app: 命名空间，不能误用为小程序支付 OpenID。
- 验证覆盖配置脱敏、未配置关闭、过期与重放、服务端换码及账号合并、协议拒绝、取消和未安装微信；执行前端类型检查与 Android 编译。

资料：Context7 当前额度耗尽，使用 Capacitor 官方 Android 插件文档及微信开放平台移动应用登录/Android 接入文档。开放平台资质、应用包名与实际签名必须匹配后才可完成真实授权联调。
