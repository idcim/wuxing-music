# APP 发布档案

本目录集中管理安卓 APP 的公开身份、签名证书、版本档案和更新交接。参数以实际 APK 和公开证书为依据；私钥及密码保存在仓库外。

## 文件索引

| 文件 | 用途 |
| --- | --- |
| [APP-INFO.md](APP-INFO.md) | 包名、签名指纹、签名保管位置和后台填写对照 |
| [RELEASES.md](RELEASES.md) | 版本历史、当前安装包、后续更新步骤 |
| [release-certificate.json](release-certificate.json) | 正式证书公开参数；构建脚本读取其包名与指纹进行校验 |
| [certificates/release-certificate.pem](certificates/release-certificate.pem) | PEM 格式公开证书，可用于查阅指纹 |
| [certificates/release-certificate.cer](certificates/release-certificate.cer) | DER 格式公开证书，可供 Windows 证书查看器打开 |
| [releases/2.0.0-2000006.json](releases/2.0.0-2000006.json) | 2.0.0 正式签名安装包的版本、哈希、源码提交及验证档案 |

正式包：`cn.azureglow.wuxing`，当前版本 `2.0.0`，versionCode `2000006`。完整构建环境及验证说明见 [安卓构建文档](../docs/ANDROID.md)，运营发布见 [APP 管理文档](../docs/APP-MANAGEMENT.md)。
