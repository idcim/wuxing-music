# 五行律音 · 版本路线图 (ROADMAP)

> 本文件（人读）记录各版本功能规划与状态；机读版本清单见根目录 [`version.json`](../version.json)（供未来 APP 更新接口读取）。发布时两者同步更新，并 bump `package.json` 与 `src/constants/version.ts`。

## 版本号规范（SemVer）

`主版本.次版本.修订号`：

- **主版本**：重大架构/不兼容变更（如小程序 → 多端 App）。
- **次版本**：新增功能（如 H5 端、离线能力）。
- **修订号**：修复与小改。
- `API_VERSION` 独立维护：后端接口契约不兼容时 +1，供灰度与兼容判断。

## 里程碑

| 版本 | 主题 | 状态 |
|------|------|------|
| **v1.0.0** | 微信小程序端首个完整版本 | ✅ 已完成 |
| **v1.1.0** | H5 端（微信内）：手机登录 + 微信登录 + 微信支付 | 🔨 进行中 |
| v1.2.0 | H5 分享/海报打磨、周报、体验优化 | ⏳ 规划 |
| **v2.0.0** | App 化（Taro RN：iOS / Android 打包上架） | ⏳ 规划 |
| v2.1.0 | **App 更新接口** + 应用内更新（强更/灰度） | ⏳ 规划（接口契约见下，已预留） |

图例：✅ 完成 ｜ 🔨 进行中 ｜ ⏳ 规划

## 平台 × 功能矩阵

| 功能 | 小程序(weapp) | H5(微信内) | App(android/ios) |
|------|:---:|:---:|:---:|
| 微信登录 | ✅ `wx.login`+code | 🔨 网页授权 OAuth2 | ⏳ 开放平台/OAuth |
| 手机登录（验证码） | ➖ | 🔨 短信验证码 | ⏳ |
| 手机登录（密码） | ➖ | 🔨 手机号+密码 | ⏳ |
| 微信支付 | ✅ 小程序 JSAPI | 🔨 公众号 JSAPI | ⏳ IAP(iOS)/H5(安卓) |
| 播放/测评/会员/CDKEY | ✅ | ✅（复用） | ⏳ |
| 买卡送人/订单/统计 | ✅ | ✅（复用） | ⏳ |
| 应用内更新 | ➖（微信托管） | ➖ | ⏳ v2.1 |

➖ 表示该端不适用。

## 各版本详情

### v1.1.0 · H5 端（本次）

目标：H5 在**微信内**打开，登录与支付打通，与现有 openid 用户体系统一。

- **手机登录**：短信验证码 + 手机号密码两种（平台无关，小程序端亦可用）。
  - 后端：`POST /api/mp/sms/send`、`/api/mp/login/phone`、`/api/mp/login/password`、`/api/mp/set-password`；短信抽象层 `sms.py`（未配服务商走 dev 兜底）。
- **微信登录**：公众号网页授权（`snsapi_base`）换 openid，`unionid > openid` 并入现有用户。
  - 后端：`GET /api/mp/h5/oauth-url`、`POST /api/mp/h5/login`、`GET /api/mp/h5/jssdk-config`；配置 `oa_config`。
- **微信支付**：公众号 JSAPI，前端 `jweixin.chooseWXPay` 调起。
  - 后端：`create_jsapi_order` 支持公众号 appid；下单加 `channel` 参数。
- **落地哲学**：外部密钥（公众号/商户/短信）未配时走 dev/mock 兜底，无账号也能联调。
- 详细实施计划见团队计划文档（plans/）。

### v2.0.0 · App 化（规划）

Taro RN 编译 iOS/Android。补 `services/*/*.rn.ts` 与 `*.rn.scss`；支付 iOS 走 Apple IAP、Android 走微信/支付宝 H5；登录补开放平台/手机号。详见 `CLAUDE.md`「未来扩展到 App」。

### v2.1.0 · App 更新接口（规划，接口已预留）

**App 更新接口契约草案**（读取根 `version.json`；本轮先落契约，实现留待 App 阶段）：

```
GET /api/app/version?platform=android&current=1.0.0

200 {
  "code": 0,
  "data": {
    "latest": "2.0.1",          // 最新版本
    "url": "https://.../app.apk", // 下载/商店地址
    "forceUpdate": false,        // 是否强制更新（current < minSupported 时应为 true）
    "minSupported": "1.9.0",     // 低于此版本必须更新
    "changelog": ["..."]         // 更新说明
  },
  "msg": "ok"
}
```

前端以 `src/constants/version.ts` 的 `APP_VERSION` 为比对基准；`forceUpdate` 或 `current < minSupported` 时阻断进入并引导更新。

## 上线所需外部配置（可后配，未配走 dev/mock）

| 用途 | 配置项（后台「设置」） | 说明 |
|------|----------------------|------|
| H5 微信登录/JSSDK/支付 appid | `oa_config`：公众号 AppID/AppSecret | 服务号，开通网页授权+JSSDK+微信支付 |
| 微信支付 | `pay_config`：商户号 v3 全套 | mch_id / APIv3 密钥 / 证书 / notify_url |
| 短信验证码 | `sms_config`：服务商密钥/签名/模板 | 阿里云 / 腾讯云等 |
| 备案域名 | — | request/pay 合法域名、网页授权回调域名 |

## 上线前安全加固清单（安全审计 2026-07-21）

H5 鉴权 + 支付上线前处理项（🔴 严重 / 🟠 高 / 🟢 中低）：

**已修复（v1.1 本次）**
- 🔴 顶号：`/api/mp/login` 与 `/api/mp/h5/login` 均强制「已配置密钥时用真实 code、拒绝前端直传合成 openid」，防 `phone:<手机号>` 猜测顶号。
- 🟠 短信验证码暴力：`sms_code.attempts` 失败 5 次即作废该码。

**上线前必办**
- 🔴 **JWT 密钥**：`.env` 必须把 `JWT_SECRET` 改随机长串（默认值 `change-me-in-production-please` 可被伪造 token 接管全站）。
- 🟠 **关闭 dev fail-open**：生产必须配齐短信 / 支付 / 公众号 / 小程序密钥——未配时后端「直通放行」（短信回传明文码、支付免付开通、登录游客兜底），仅供联调。建议加统一 `DEBUG`/`ENV` 开关集中 gate 这些兜底。
- 🟠 **限频**：短信发送补 IP / 日上限 + 后端手机号格式校验（防短信轰炸/盗刷）；密码登录、CDKEY 兑换补失败限频（CLAUDE.md 约定兑换 5 次/分钟未实现）。
- 🟠 **种子测试码**：`seed.py` 无条件植入公开测试 CDKEY（含 365 天年藏），生产应仅在 DEBUG 下植入。
- 🟠 **依赖升级**：`python-jose 3.3.0→3.4.0`、`python-multipart 0.0.20→0.0.31`、`starlette`（连带 FastAPI）——已知 CVE。
- 🟢 **其它**：`bind-phone` 改绑校验短信码 + `user.phone` 唯一约束；对外错误信息不透传上游原文（详情仅入日志）；token（localStorage、7 天不可吊销 JWT）按需加固。

---

## 变更记录

与 `version.json` 的 `changelog` 保持一致：

- **1.1.0**（2026-07-21）：H5 端上线（手机/微信登录、微信支付）；版本管理基建。
- **1.0.0**（2026-05-23）：微信小程序端首个完整版本。
