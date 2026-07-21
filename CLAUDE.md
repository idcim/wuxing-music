# 五行律音 · 安神助眠音乐小程序

## 项目概述

**五行律音** 是一款基于中医五行学说的会员制助眠音乐小程序，通过体质测评为用户匹配专属音律方案，结合古传五音疗愈理论（角徵宫商羽）与现代频率疗法（174Hz/396Hz/528Hz/741Hz等），提供个性化的安神、助眠、冥想音乐内容。

### 核心价值

- **个性化**：通过 4 题快速测评定位用户五行体质偏向
- **专业性**：每首曲目对应五脏、季节、频率，有理论依据
- **沉浸感**：深色冥想氛围 + 高级时尚视觉
- **变现路径**：免费试听 → 月卡 → 年卡 + CDKEY 兑换 + **买卡送人（礼物码）**

------

## 当前状态（务必先读）

> ⚠️ 本文档一度停留在"待初始化"阶段，现已按实际实现全面校正。运行/部署的**操作细节**见 [`README.md`](README.md)、[`backend/README.md`](backend/README.md)、[`admin/README.md`](admin/README.md)；本文件负责讲"**是什么 / 规范 / 数据结构 / 协作约定**"。

本项目是一个 **monorepo**，三部分均已落地：

| 目录 | 角色 | 技术栈 | 状态 |
| ---- | ---- | ------ | ---- |
| `src/` | 小程序 / H5 前端 | **Taro 4.2 + React 18 + TS + Sass + Zustand** | 小程序主流程完成；H5（微信内）登录/支付已接入（v1.1） |
| `backend/` | 后端 API（管理端 + 小程序公开端） | **FastAPI + SQLAlchemy + 外部 MySQL**（开发可 SQLite），Docker | 全套接口 + 微信支付/礼物码/统计已实现，待真实商户配置上线 |
| `admin/` | 管理后台 | **Vue3 + Vite + Element Plus + Pinia** | 15 个视图完成 |

- **数据源开关**：`src/constants/env.ts` 的 `USE_MOCK`。当前 `false`，直连线上 `API_BASE = https://app-api.azure-glow.cn`。置 `true` 可在无后端时本地跑通登录/曲目/兑换/支付/音频全链路。
- **已完成**：前端全部页面与播放体验、后端管理 CRUD、小程序公开接口对接、微信支付（JSAPI 统一下单 + 回调验签，逻辑已就绪）、CDKEY 兑换、买卡送人礼物码、订单/退款、聆听历史与周统计、海报小程序码、站点/存储/支付/小程序配置与文件上传（本地）。
- **已完成（H5 端，v1.1）**：H5（微信内）手机登录（短信验证码 + 手机号密码）、微信登录（公众号网页授权 OAuth2）、微信支付（公众号 JSAPI）；短信/公众号抽象层（未配则 dev 兜底）；版本管理基建（`version.json` + `docs/ROADMAP.md` + `src/constants/version.ts`）。详见 [`docs/ROADMAP.md`](docs/ROADMAP.md)。
- **待补**：真实微信商户号 + 证书上线联调；真实公众号/小程序 AppSecret 配置后授权与 `code→openid` 生效验证；短信服务商密钥接入（抽象层已就位）；对象存储（OSS）上传接入（抽象层已就位）；**上线前安全加固清单见 [`docs/ROADMAP.md`](docs/ROADMAP.md)**。
- **不做**：❌ 离线下载（已全端移除，勿再引入）。

------

## 技术栈（已定，勿再按"方案 A/B/C"选型）

立项文档曾并列 Taro / 原生 / uni-app 三方案，现已**确定并落地方案 A**，且实际细节与早期设想不同，以此处为准：

### 前端 `src/`

```
- Taro 4.2（注意：不是 3.x；4.x + Vite 编译）
- React 18 + Hooks + TypeScript（strict）
- Sass（注意：不是 Less；design token 在 src/styles/variables.scss）
- Zustand（状态管理）
- 无第三方 UI 组件库（未用 NutUI / vant；界面按原型手写，最大化控制力与跨端可控性）
- 图标：lucide-static 生成 SVG 路径 → 自研 Icon 组件用 background-image 渲染（见「图标方案」）
```

> 为何不用 NutUI：本项目视觉高度定制（深色冥想氛围、五行渐变），组件库反而是负担；且 Taro4+Vite 下自定义 tabBar 有编译 bug（见「已知陷阱」），越少黑盒越好。

### 后端 `backend/`

```
- FastAPI + Uvicorn
- SQLAlchemy 2.x（Mapped/mapped_column 声明式模型）
- 数据库：生产外部 MySQL（utf8mb4），开发可切 SQLite
- 鉴权：JWT（python-jose）；管理端 sub=<username>，小程序端 sub=user:<id>
- 微信支付：JSAPI 统一下单 + 回调解密（app/wxpay.py）
- 存储抽象：本地 / OSS 透明切换（app/storage.py）
- Docker + docker-compose（根目录一键起后端 + 后台，连外部 MySQL）
```

### 管理后台 `admin/`

```
- Vue3 + Vite + TypeScript
- Element Plus（组件库）+ Pinia（状态）+ Vue Router
- 生产用 Nginx 托管，/api 反代到后端（同源无跨域）
```

------

## 项目结构（monorepo）

```
wuxing-music/
├── src/                        # 小程序 / H5 前端（Taro 4 + React 18）
│   ├── app.config.ts           # 全局配置（页面注册 / 后台音频模式）
│   ├── app.tsx / app.scss      # 入口 / 全局样式（含 keyframes）
│   ├── pages/                  # 16 页（均为「页内 TabBar + redirectTo」而非原生 tabBar）
│   │   ├── splash/             #   启动页
│   │   ├── onboard/            #   引导页
│   │   ├── login/              #   登录
│   │   ├── quiz/               #   五行测评（4 题）
│   │   ├── result/             #   测评结果
│   │   ├── home/               #   首页（归处 / 本命曲目）
│   │   ├── explore/            #   探律（五行卡入口）
│   │   ├── element/            #   单元素详情（下钻曲目列表）
│   │   ├── member/             #   会员（套餐 / 购买 / 买卡送人）
│   │   ├── profile/            #   我的
│   │   ├── userinfo/           #   资料编辑（昵称 / 头像）
│   │   ├── settings/           #   设置
│   │   ├── orders/             #   我的订单（购买记录 + 礼物码回看）
│   │   ├── history/            #   聆听历史 + 周统计
│   │   ├── player/             #   全屏播放器（旋转罗盘 / seek）
│   │   └── about/              #   关于 / 条款
│   ├── components/             # 8 个：CdkeyModal / Icon / MiniPlayer / Playlist
│   │   │                       #        PosterShare / SleepTimer / TabBar / TrackCard
│   ├── stores/                 # zustand：user / player / content
│   ├── services/               # 业务与平台能力封装（禁止组件里直接 wx.xxx）
│   │   ├── api.ts              #   request()：{code,data,msg} 信封 + Bearer
│   │   ├── auth.ts             #   微信登录 / 静默登录 / profile
│   │   ├── content.ts          #   五行 + 曲目
│   │   ├── cdkey.ts            #   兑换码（含 mock）
│   │   ├── pay.ts              #   微信支付 / 买卡送人 / 我的订单
│   │   ├── share.ts            #   转发 / 朋友圈
│   │   ├── site.ts             #   站点信息
│   │   ├── stats.ts            #   周聆听统计
│   │   ├── user.ts             #   资料 / 绑定手机
│   │   ├── audio/              #   音频（分端：index.weapp.ts / index.h5.ts / types.ts）
│   │   └── storage/            #   本地存储（index.ts，统一封装）
│   ├── constants/
│   │   ├── wuxing.ts           #   五行运行时数据（角徵宫商羽 / 五脏 / 曲目）
│   │   ├── quiz.ts             #   测评题库
│   │   ├── plans.ts            #   会员套餐兜底数据
│   │   └── env.ts              #   USE_MOCK / API_BASE / TOKEN_KEY
│   ├── utils/                  # color / format / nav / platform / share / url
│   ├── styles/variables.scss   # ★ design token（基色 / 圆角 / 间距 / 五行色 map）
│   ├── assets/                 # 图标 / 图片
│   └── types/index.ts          # 全量 TS 类型
├── backend/                    # FastAPI 后端
│   └── app/
│       ├── main.py             #   应用入口 + 路由挂载 + 建表
│       ├── config.py           #   .env 配置（DATABASE_URL / JWT / 管理员）
│       ├── database.py         #   引擎 / Session / Base
│       ├── models.py           #   ★ 11 张表（见「后端数据模型」）
│       ├── schemas.py          #   Pydantic 出入参 + ok() 信封
│       ├── security.py         #   密码哈希 / JWT / 管理员依赖
│       ├── seed.py             #   启动种子数据（五行/曲目/套餐/测评/测试兑换码/管理员）
│       ├── wxpay.py            #   微信支付统一下单 + 回调解密
│       ├── storage.py          #   本地 / OSS 存储抽象
│       └── routers/            #   auth / users / orders / plans / elements / tracks
│           │                   #   cdkeys / quiz / settings / site / upload（管理端）
│           └── mp.py           #   ★ 小程序公开端（/api/mp/*）
├── admin/                      # Vue3 管理后台
│   └── src/
│       ├── api/                #   接口封装（index.ts / request.ts）
│       ├── stores/auth.ts      #   Pinia 登录态
│       ├── router/             #   路由
│       └── views/              #   15 视图（Dashboard / Users / Orders / Plans / Elements
│                               #           Tracks / Cdkeys / Quiz / Site / Storage / MpPanel …）
├── prototype/
│   └── wuxing-music-app.jsx    # 原型参考（Web React 版）
├── docker-compose.yml          # 一键起 backend + admin（连外部 MySQL）
├── project.config.json         # 微信开发者工具配置
└── package.json                # 前端脚手架
```

------

## 数据流与 Mock 模式

前端所有网络请求统一走 `src/services/api.ts` 的 `request<T>()`：

- 基址 `API_BASE`，响应信封 `{ code, data, msg }`，`code === 0` 为成功，否则抛 `ApiError(code, msg)`。
- 默认携带 `Authorization: Bearer <token>`（token 存 `storage`，键 `wx_token`）；公开接口传 `{ auth: false }`。
- HTTP 非 2xx → 抛 `ApiError(statusCode)`。

**`USE_MOCK` 开关**（`src/constants/env.ts`）：每个 service（auth / cdkey / pay / content …）内部 `if (USE_MOCK) { …本地假数据… }`，因此后端未就绪时前端可独立跑通。切真实接口只需把 `USE_MOCK` 置 `false` 并填对 `API_BASE`。修改任何 service 时**务必同时维护 mock 与真实两条分支**。

**登录约定（小程序）**：`wxLogin()` 取 `wx.login()` 的临时 `code` + 稳定游客 openid 一起发给 `/api/mp/login`；后端配置了 AppSecret 时用 `code` 调 `jscode2session` 换真实 openid，否则回退前端直传的稳定 openid（保证游客态身份不漂移）。**切勿把每次都变的 `code` 当 openid 用**。

**登录约定（H5，v1.1）**：按平台分支（`utils/platform.ts` 的 `isH5`/`isInWeChat`）。手机登录（`loginByPhone`/`loginByPassword`）平台无关。微信登录 `wechatLoginH5()` 走公众号网页授权：无 `code` → 取 `/api/mp/h5/oauth-url` 跳转授权；带 `code` 回跳 → `/api/mp/h5/login` 换 `oa_openid`（`app.tsx` 在微信内静默触发并清理 URL）。**安全约束**：`/api/mp/login`（小程序）与 `/api/mp/h5/login`（H5）均——已配置密钥时**必须用真实 `code` 换 openid、忽略前端直传标识**，仅未配置时才用游客标识走 dev 兜底（防绕过授权/顶号）；手机号合成 openid `phone:<手机号>` 不可经 openid 直信路径登录（详见 [`docs/ROADMAP.md`](docs/ROADMAP.md) 安全加固清单）。

------

## 设计系统

### 字体

小程序无法直接用 Google Fonts。**当前采用系统字体降级**（`src/app.scss`），无需异步加载、无闪烁：

- 中文正文：`PingFang SC, 苹方-简, system-ui`
- 衬线（`.serif`，约等于 Noto Serif SC）：`STSong, Songti SC, SimSun`
- 装饰英文/数字（`.cormorant`，约等于 Cormorant Garamond）：`Georgia, STSong, Times New Roman`

> 可选增强（未启用）：如需精确字形，可后续用 `wx.loadFontFace()` 加载 CDN 上的 woff2/ttf；当前为控制体积与首屏稳定，暂不引入。

### 配色系统

Design token 定义在 **`src/styles/variables.scss`（Sass 变量，非 Less）**，各页/组件 `@import` 复用。

#### 全局基色

```scss
$bg-deep: #03050a;         // 最深底
$bg-mid: #0a0e1a;          // 中间底
$text-primary: #e2e8f0;    // 主文字
$text-secondary: #94a3b8;  // 次文字
$text-tertiary: #64748b;   // 辅助文字
$text-quaternary: #475569; // 弱化文字
$border: rgba(255,255,255,0.06);
$surface: rgba(255,255,255,0.025);
```

#### 五行色板（必备核心数据）

`variables.scss` 存 `$wuxing-colors` map 供样式循环；运行时数据（含频率/五脏/曲目）在 `src/constants/wuxing.ts`。二者色值一致：

| 元素 | primary   | accent    | glow                    | 对应五脏 | 频率示例     |
| ---- | --------- | --------- | ----------------------- | -------- | ------------ |
| 木   | `#84cc16` | `#bef264` | `rgba(132,204,22,0.25)` | 肝胆     | 324Hz / 角调 |
| 火   | `#f97316` | `#fdba74` | `rgba(249,115,22,0.25)` | 心小肠   | 396Hz / 徵调 |
| 土   | `#eab308` | `#fde047` | `rgba(234,179,8,0.25)`  | 脾胃     | 528Hz / 宫调 |
| 金   | `#cbd5e1` | `#f1f5f9` | `rgba(203,213,225,0.2)` | 肺大肠   | 741Hz / 商调 |
| 水   | `#38bdf8` | `#7dd3fc` | `rgba(56,189,248,0.25)` | 肾膀胱   | 174Hz / 羽调 |

#### 圆角与间距（`variables.scss`）

```scss
$radius-sm: 16rpx;  $radius-md: 24rpx;  $radius-lg: 32rpx;  $radius-xl: 44rpx;  $radius-pill: 60rpx;
$pad-outer: 44rpx;  $pad-card: 32rpx;   $gap-list: 20rpx;
```

### 动效（`app.scss` 已定义 keyframes）

- 进场：`fadeUp 0.6s cubic-bezier(0.16,1,0.3,1)`（`.fade-up`）
- 浮动：`float 4s ease-in-out infinite`（`.float`）
- 罗盘旋转：`rotate-slow`（用处指定 30-40s linear infinite）
- 播放波形：`wave`（scaleY 0.3-1）
- 星点：`star-twinkle`；另有 `fadeIn / shimmer / pulse-ring / progress-fill`

### 图标方案

**lucide-react 在小程序不可用**。本项目做法：

- 用 `lucide-static` 在开发期取 SVG，路径数据集中在 `src/components/Icon/paths.ts`；
- `Icon` 组件（`src/components/Icon/index.tsx`）用 **`View` + `background-image`（URL 编码的 SVG）** 渲染，颜色/尺寸由 props 控制。
- ⚠️ 不用 `<Image>` 渲染图标：真机下偶发 `appServiceSDKScriptError`，`background-image` 更稳（见「已知陷阱」）。

需要的图标清单（示意）：

```
Sprout, Flame, Mountain, Gem, Droplets (五行)
Play, Pause, Heart, ListMusic (播放)
Crown, Gift, KeyRound, Check, X, Zap (会员/兑换)
Home, Compass, User, ChevronRight, ArrowRight (导航)
Moon, Sparkles, Star, Timer, Volume2 (装饰/功能)
TrendingUp, BarChart3, History, Settings (统计/设置)
```

------

## 核心数据结构（前端，`src/types/index.ts`）

以 `types/index.ts` 为准（后端 `_user_dict` / `_track_dict` 出参与此对齐）。

```typescript
export type ElementId = '木' | '火' | '土' | '金' | '水';
export type NoteName  = '角' | '徵' | '宫' | '商' | '羽';

export interface Track {
  id: number;
  title: string;
  duration: string;          // "MM:SS"
  durationSec: number;
  hz: string;                // "324Hz" 或 "角调"
  tag: string;
  plays: string;             // "12.4k"（后端 = 后台基数 + 实际聆听次数）
  audioUrl: string;
  coverUrl?: string;
  isPremium: boolean;
  previewSec?: number;       // 免费试听秒数（默认 30）
}

export interface WuxingElement {
  id: ElementId; en: string; icon: string;
  primary: string; accent: string; glow: string; bg: string;
  note: NoteName; notePinyin: string;
  organ: string; season: string; quality: string;
  desc: string; sleepTip: string;
  tracks: Track[];
}

export type ElementScores = Record<ElementId, number>;
export interface QuizOption { text: string; score: Partial<ElementScores>; }
export interface QuizQuestion { q: string; opts: QuizOption[]; }

export type PlanId = 'free' | 'month' | 'year' | 'trial';
export interface Membership {
  type: PlanId;
  name: string;              // "听闻" / "月悦" / "年藏"
  startAt: string | null;
  expireAt: string | null;
  source: 'purchase' | 'cdkey' | 'gift' | null;
}
export interface User {
  id: string; openid: string; unionid?: string; phone?: string;
  nickname: string; avatar: string;
  element: ElementId | null; elementScores: ElementScores;
  quizCompletedAt: string | null;
  membership: Membership; createdAt: string;
}
```

- 五行完整配置见 `src/constants/wuxing.ts`（含 `bg` 渐变、每元素曲目）。
- 测评题库见 `src/constants/quiz.ts`。

------

## 核心功能模块

### 1. 五行测评 `pages/quiz/`

4 题单选，顶部进度条；每题选项加分，末题算最高分元素并跳转 `result`，结果 `POST /api/mp/quiz` 同步后端 + 本地缓存。

```typescript
const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
```

### 2. 音频播放 `services/audio/`（分端）

- 小程序：`Taro.getBackgroundAudioManager()`（**用 BackgroundAudioManager 才能后台/锁屏播放**，`app.config.ts` 已配 `requiredBackgroundModes: ['audio']`）。
- H5：`index.h5.ts` 对应实现；统一接口见 `types.ts`。
- 非会员 **30 秒试听**：`previewSec` 到点暂停并提示升级。
- iOS 弱网首次加载慢，需 loading 态；`audioUrl` 当前多为占位，真机需在微信后台配 `downloadFile` 合法域名，mock 下回退 `MOCK_AUDIO_URL`。

### 3. 睡眠定时器 `components/SleepTimer/`

四档 15 / 30 / 45 / 60 分钟：`setTimeout` 到点 `stop`；切换/取消时 `clearTimeout`。

### 4. CDKEY 兑换系统 ⭐

**前端**（`components/CdkeyModal/` + `services/cdkey.ts`）：3 处入口（首页/会员/我的）→ 底部抽屉输入（自动大写）→ `redeemCdkey()` → 三态展示（success 显示卡名+天数并刷新会员；used 已使用；error 无效可重试）。

**后端**（`backend/app/routers/mp.py::mp_redeem`，`POST /api/mp/cdkey/redeem`，需登录）：校验存在/未使用/未禁用过期 → **剩余会员期叠加**发放权益 → 置 `used` + 写 `cdkey_redeem_log`。失败返回业务错误信息（"兑换码不存在/已被使用/不可用/已过期"），前端据消息映射为 `invalid` / `used`。

> 说明：早期文档里的 40001-40004 业务码方案未采用，以 `mp.py` 实际契约为准。

**管理端生成**（`routers/cdkeys.py`）：批量生成 / 导出 / 禁用。生成规则：`{前缀}-{年份}-{4位}-{4位}`，字符集 `A-Z + 2-9`（去 0/O/1/I），如 `WUXING-2026-A8K3-N9P2`。买卡送人的礼物码前缀为 `GIFT-`。

**安全**：兑换需登录态；失败限频；记录 IP/device；批量生成校验唯一性。

### 5. 会员体系与支付

**三档套餐**（`constants/plans.ts` 兜底，后台 `plan` 表可改）：

| ID    | 名称 | 价格 | 时长  | 特性                          |
| ----- | ---- | ---- | ----- | ----------------------------- |
| free  | 听闻 | ¥0   | 永久  | 每日试听、30秒预览            |
| month | 月悦 | ¥18  | 30天  | 全部曲目                      |
| year  | 年藏 | ¥128 | 365天 | 专属冥想课、1v1咨询           |

**支付**（`services/pay.ts` ↔ `mp.py`）：
- `POST /api/mp/pay/create-order` 建订单（pending），下单体带 `channel: 'weapp'|'h5'`。**未配置商户时后端直接开通**（`dev_opened`，便于联调）；已配置则调微信 JSAPI 统一下单返回 `payParams`，前端**按端拉起**（小程序 `Taro.requestPayment`；H5 走 `services/wechat` 的 `chooseWXPay`），成功后由 `POST /api/mp/pay/callback` 异步开通，前端短轮询 `GET /api/mp/membership` 取最新会员态。H5 用**公众号 appid + `user.oa_openid`** 作 payer（后端 `_resolve_pay_payer` 按 channel 选）。
- 会员发放一律**按套餐天数在剩余期上累加续期**。
- iOS App 端订阅须走 Apple IAP（小程序端不受影响，详见「支付特别说明」）。

### 6. 买卡送人（礼物码）

`services/pay.ts::purchaseGift` ↔ `POST /api/mp/gift/create-order`：建 `is_gift` 订单，支付完成后后端生成一张未使用的 `GIFT-` 兑换码写入订单 `gift_code`，前端轮询 `GET /api/mp/gift/code` 取回，用 `PosterShare` 生成海报 + 小程序码分享。买家不直接开会员，受赠者用礼物码兑换。

### 7. 我的订单 / 聆听历史 / 周统计 / 海报码

- `GET /api/mp/orders`：购买 + 礼物订单列表（`pages/orders/`）。
- `POST/GET /api/mp/history`：上报/拉取聆听历史（去重最新 50 条，`pages/history/`）。
- `GET /api/mp/stats/weekly`：近 7 天每日次数/分钟 + 本周总时长。
- `POST /api/mp/qrcode`：`getwxacodeunlimit` 生成无限量小程序码（海报二维码用）。

------

## API 端点清单

响应统一 `{ code, data, msg }`（`code=0` 成功）。

### 小程序公开端 `/api/mp/*`（`backend/app/routers/mp.py`）

```
POST /api/mp/login              # code+openid → token+user（内部 jscode2session 换 openid）
POST /api/mp/sms/send           # 发短信验证码（未配短信→dev 兜底回传 devCode）
POST /api/mp/login/phone        # 手机号 + 验证码登录
POST /api/mp/login/password     # 手机号 + 密码登录
POST /api/mp/set-password       # 设置/改密码（需登录）
GET  /api/mp/h5/oauth-url       # 公众号网页授权跳转地址（未配→configured:false）
POST /api/mp/h5/login           # 公众号 code 换 openid 登录（未配→guestId dev 兜底）
GET  /api/mp/h5/jssdk-config    # wx.config 签名（JSAPI 支付 / 分享）
GET  /api/mp/profile            # 我的资料
PATCH|POST /api/mp/profile      # 改昵称/头像（同时支持 POST 规避代理对 PATCH 的 405）
POST /api/mp/upload             # 用户头像上传（≤5MB）
GET  /api/mp/membership         # 会员态（含 isPremium）
POST /api/mp/bind-phone         # 绑定手机号
POST /api/mp/quiz               # 提交测评（element + scores）
GET  /api/mp/elements           # 五行 + 曲目（公开免登录）
GET  /api/mp/plans              # 套餐（公开）
POST /api/mp/cdkey/redeem       # 兑换码
POST /api/mp/pay/create-order   # 会员下单（未配商户则直开）
POST /api/mp/pay/callback       # 微信支付回调（验签/幂等/金额校验）
POST /api/mp/gift/create-order  # 买卡送人下单
GET  /api/mp/gift/code          # 轮询礼物码
GET  /api/mp/orders             # 我的订单
POST /api/mp/history            # 上报聆听
GET  /api/mp/history            # 聆听历史
GET  /api/mp/stats/weekly       # 周聆听统计
POST /api/mp/qrcode             # 小程序码（海报）
```

### 管理端 `/api/admin/*`（需 Bearer；`admin/src/api/index.ts` 有全量封装）

```
POST /api/admin/login  GET /me  GET /dashboard
GET  /users  GET /users/{id}  POST /users/{id}/grant                 # 用户 + 后台开通会员
GET  /orders GET /orders/{id} POST /orders/{id}/refund  .../refund/confirm  # 订单 + 退款
GET/POST /plans     DELETE /plans/{id}
GET/POST /elements  DELETE /elements/{id}
GET  /tracks POST /tracks  PUT/DELETE /tracks/{id}
GET  /cdkeys POST /cdkeys/generate  POST /cdkeys/{id}/disable
GET/POST /quiz  PUT/DELETE /quiz/{id}
GET/PUT /settings/pay | /settings/site | /settings/storage | /settings/mp
POST /settings/storage/migrate      # 存储迁移
POST /upload                        # 后台文件/封面/证书上传
```

------

## 后端数据模型（`backend/app/models.py`，SQLAlchemy）

> 早期文档写的是手工 MySQL DDL；**实际由 SQLAlchemy 模型声明，启动自动建表 + 种子数据**（`main.py::_auto_migrate` 会为已存在的表自动补加新列）。以下为 12 张表要点（`order` 是 MySQL 保留字，订单表名 `app_order`）：

| 表 | 说明 | 关键字段 |
| -- | ---- | -------- |
| `admin` | 管理员 | username / password_hash / is_active |
| `element` | 五行配置（id=木火土金水） | primary/accent/glow/bg、note/organ/season、sleep_tip |
| `track` | 曲目 | element_id(FK)、hz、audio_url、cover_url、is_premium、preview_sec、is_online |
| `plan` | 套餐 | id(free/month/year/trial)、price、duration_days、features(JSON) |
| `user` | 用户 | openid/unionid/**oa_openid**/phone/**password_hash**、element、membership_type/name/expire_at/source |
| `cdkey` | 兑换码 | code、batch_id、plan_type、status(unused/used/disabled/expired) |
| `cdkey_redeem_log` | 兑换日志 | user_id、cdkey_id、ip、device |
| `app_order` | 订单 | order_no、status(pending/paid/refunding/refunded…)、**is_gift/gift_code**、**refund_*** |
| `quiz_question` | 测评题 | q、options(JSON) |
| `setting` | KV 配置 | key/value（`pay_config`/`site_config`/`storage_config`/`mp_config`/`oa_config`(公众号)/`sms_config`(短信)） |
| `play_history` | 聆听历史 | user_id、track_id、played_at |
| `sms_code` | 短信验证码（手机登录） | phone、code、scene、expire_at、used、attempts（失败≥5 作废） |

------

## 管理后台 `admin/`（Vue3 + Element Plus）

页面（`admin/src/views/`）：登录、仪表盘、歌曲（分页/筛选/音频封面上传）、五行、套餐、兑换码（批量生成/导出/禁用）、测评、订单（详情+退单）、用户（详情+开通会员）、站点设置（站点/小程序/文件存储/支付，含 LOGO/证书上传）。默认管理员 `admin` / `admin123`（由 `backend/.env` 覆盖）。

------

## 开发优先级（现状）

### Phase 1 - MVP ✅ 已完成
- [x] 原型确认、Taro 脚手架、五行/测评数据搬入
- [x] 启动/引导/测评/结果、首页/探律/会员/我的
- [x] 音频播放器核心 + MiniPlayer + 全屏播放器
- [x] 微信登录 + 用户中心

### Phase 2 - 会员 ✅ 基本完成
- [x] 会员页/套餐、微信支付集成（逻辑就绪）、CDKEY 兑换（前后端）
- [x] 会员权限校验（30 秒试听）
- [x] 后台 CDKEY 管理（生成/导出/禁用）

### Phase 3 - 增强 🔶 部分完成
- [x] 睡眠定时器、后台/锁屏播放、聆听历史 + 周统计
- [x] 转发分享 + 朋友圈 + 海报小程序码、买卡送人礼物码、订单/退款
- [ ] 推送（睡眠提醒）
- [x] ~~离线下载~~ **已移除，不做**

### H5 端（v1.1）✅ 已完成
- [x] 手机登录（短信验证码 + 手机号密码）、微信网页授权登录、H5 微信支付（公众号 JSAPI）
- [x] 版本管理基建（`version.json` + `docs/ROADMAP.md` + `constants/version.ts`）
- [x] SMS 验证码校验次数上限（防暴力，失败 5 次作废）
- [ ] APP 更新接口（契约已定，随 APP 阶段实现）；**上线前安全加固**（见 [`docs/ROADMAP.md`](docs/ROADMAP.md)）

### 待补（上线前）
- [ ] 真实微信商户号 + 证书上线联调（后台可配）
- [ ] 真实 AppSecret 配置后 `code→openid` 生效验证
- [ ] OSS 上传接入（抽象层已就绪）

------

## 未来扩展到 App（跨端策略）

> **现状注记**：已落地 **微信小程序（weapp）+ H5（微信内）** 两端。`services/audio/`、`services/wechat/` 已按端分文件（`index.weapp.ts` / `index.h5.ts`）；`auth.ts` / `pay.ts` 用 `isWeapp`/`isH5` 运行时分支（H5 走公众号网页授权 + JSAPI，小程序走 `wx.login` + `requestPayment`）；`storage/` 仍单文件。**自定义 tabBar 因 Taro4+Vite 编译 bug 用页内 `TabBar` 组件 + `redirectTo` 替代**；RN 端（`.rn.ts` / `.rn.scss`）尚未开始。以下为**未来 App 化的目标规范**，新代码应朝此方向组织。

**总原则**：业务逻辑跨端共用，UI 与平台 API 分平台实现。业务层零依赖平台 API（组件禁止直接 `wx.xxx`，一律经 `services/` 封装）；差异样式走 `.weapp.scss` / `.rn.scss`，共用走 `.scss`；状态用 Zustand（RN/小程序均可）。

### 平台能力差异速查

| 能力     | 小程序                       | React Native                     | 抽象方案                   |
| -------- | ---------------------------- | -------------------------------- | -------------------------- |
| 音频播放 | `BackgroundAudioManager`     | `react-native-track-player`      | `services/audio/`（已分端）|
| 本地存储 | `wx.setStorageSync`          | `AsyncStorage`                   | `services/storage/`        |
| 支付     | `wx.requestPayment`          | Apple IAP（订阅必须）/ 微信H5SDK | `services/pay.ts`          |
| 登录     | `wx.login` + code            | 手机号/邮箱/三方 OAuth           | `services/auth.ts`         |
| 分享     | `open-type=share` / 转发     | `react-native-share`             | `services/share.ts`        |
| 字体加载 | 系统降级 / `wx.loadFontFace` | 原生工程链接 ttf                 | -                          |

### 样式兼容性陷阱（RN 是 CSS 子集 + Flexbox）

| 现状用法                   | RN 兼容性        | 替代方案                                                    |
| -------------------------- | ---------------- | ----------------------------------------------------------- |
| `radial-gradient` 背景     | ❌ 不支持         | `react-native-linear-gradient` 多层叠加                     |
| `backdrop-filter: blur()`  | ❌ 不支持         | `@react-native-community/blur`                              |
| `box-shadow`               | ⚠️ 部分           | iOS `shadow*` / Android `elevation`                         |
| 父元素 color/font 继承     | ❌ 不继承         | 每个 `Text` 单独写样式                                      |
| `@keyframes` 动画          | ❌ 不支持         | `Animated` / `react-native-reanimated`                      |
| `position: fixed`          | ❌ 不支持         | `position: absolute` + 顶层容器                             |
| `transform: rotate`、Flexbox、hex 配色、`border-radius`、`opacity` | ✅ 支持 | 不变 |

### 支付特别说明 ⚠️

iOS 端订阅类商品**必须走 Apple IAP**（苹果抽 30%，禁止引导外部支付）。策略：小程序端微信支付原价（¥18 / ¥128）；iOS App 端苹果内购需上调覆盖佣金；Android App 端可用微信/支付宝 H5 原价。**CDKEY 与礼物码路径不受影响**，App 化后反而更重要（可绕开苹果税做营销）。

### 分两阶段实施

- **阶段一（当前）**：严格按上述目录组织；平台 API 走 service 层；文件名带 `.weapp` / `.rn` 后缀即使只实现一端；样式暂只写主样式，`// TODO: RN 不支持` 标注。
- **阶段二（业务跑通后）**：补全各 service 的 `.rn.ts` 与样式 `.rn.scss`、配置原生工程（iOS Xcode / Android）、上架审核。

------

## 已知陷阱

1. **自定义 tabBar 不可用**：Taro4 + Vite 下 `custom: true` 原生 tabBar 不编译（官方 bug #18415）。本项目改用**页内 `TabBar` 组件 + `Taro.redirectTo`** 切换，`app.config.ts` 不声明 `tabBar`。
2. **图标别用 `<Image>`**：真机偶发 `appServiceSDKScriptError`；用 `View` + `background-image`（URL 编码 SVG）渲染（见 `Icon` 组件）。
3. **本地连后端**：开发者工具「本地设置」勾「不校验合法域名」；真机把 `API_BASE` 改成局域网 IP，并在微信后台配 request/downloadFile 合法域名。
4. **增量构建缓存损坏**（报 `taro.useState/useMemo is not a function` 等）：清缓存全量重建 `rm -rf dist node_modules/.vite .swc && npm run dev:weapp`。
5. **游客模式 `wx.login` 受限**（`webapi_getwxaasyncsecinfo:fail`）：已自动兜底稳定游客 openid；真实 AppID 登录即正常。
6. `wx.createInnerAudioContext` 无法后台播放——一律用 `BackgroundAudioManager`。
7. 真机调试音频问题多，模拟器不可信；iOS 弱网首次加载慢，需 loading 态。
8. 小程序 `style` 不支持全部 CSS：`backdrop-filter` / `radial-gradient` 需在 `.scss` 里验证；跨端另见上表。
9. **H5 微信 JS-SDK 签名**：`wx.config` 签名 URL 必须去掉 `#hash`（Taro H5 是 hash 路由，`services/wechat/index.h5.ts` 已 `split('#')[0]`）。iOS 微信对 SPA 用「首次进入页面的 URL」签名，若 SPA 路由跳转后支付签名失效，需用进入时缓存的 entry URL 重签。
10. **H5 登录/支付仅微信内可用**：走公众号网页授权 + JSAPI；外部浏览器（Safari/Chrome）暂不支持（未来加 H5 MWEB / 扫码，见 ROADMAP）。H5 联调需在公众号后台配「网页授权域名」「JS 安全域名」，商户后台绑定公众号 appid。
11. **公众号 openid ≠ 小程序 openid**：跨端同一用户靠开放平台 UnionID 打通；`user.oa_openid` 专供 H5 JSAPI 支付 payer。
12. **行内样式禁止直接写 `rpx`**：`rpx` 只有写在 `.scss` 里才会被 postcss-pxtransform 换算；写在 `.tsx` 的 `style={{}}` 里不过 postcss，H5 下浏览器判定为非法值并**丢弃整条声明**——元素塌成 0×0（图标全部消失）、`border` / `box-shadow` 直接失效。一律用 `src/utils/unit.ts` 的 `rpx(n)`（weapp 编译成 `${n}rpx`，H5 换算成 rem）。不要用 `Taro.pxTransform`：它内部 `~~` 取整，会截断 splash 星点这类小数尺寸。
13. **H5 全局底色要改两处，缺一仍是白底**：① H5 没有 `page` 元素（页面容器是 `div.taro_page`），postcss-html-transform 只把 `view/text/button` 等小程序标签映射成 `taro-*-core`，**不会**把 `page` 映射成 `body`——全局样式必须写 `page, body { ... }`，否则底色/文字色整个失效。② 更关键：Taro H5 路由**运行时**往 `<head>` 注入 `.taro_router > .taro_page { background-color: #fff }`，这层盖在 `body` 之上，只补 `body` 看不出任何变化，没写自身背景的页（首页/探律/会员/我的/result/element/player）照旧白底。注入的 style 排在 `<link>` 之后、同权重会赢，必须**提权**覆盖：`body .taro_router > .taro_page { background-color: $bg-deep }`（保持不透明，否则左右滑动切页时前后两页内容互相透出）。`app.config.ts` 的 `window.backgroundColor` 在 H5 只作用于导航栏，**不管** `.taro_page`。小程序端这两条里的 `body` 均编译成 `.h5-body`，无匹配元素，无副作用。
    > 排查提示：验证背景问题必须看**实际绘制的那一层**（沿 `elementFromPoint` 向上找第一个非透明祖先），只量 `document.body` 会得出「已修好」的错误结论。

------

## Claude Code 协作约定

### 代码导航（重要）

- **查代码优先用 codegraph**（`codegraph_explore` 为主）：结构性问题（谁调用谁 / 定义在哪 / 改动影响面 / 某系统怎么跑）一次调用直接给带行号源码，比 grep+Read 更快更准。已验证本仓库索引可用。
- grep / Read 仅用于补 codegraph 未覆盖的字面细节（字符串/注释）。

### 代码风格

- TS strict；函数式组件 + Hooks，不用 class。
- 组件 PascalCase，工具 camelCase；注释中文、变量英文。
- 单文件超 300 行考虑拆分。
- **五行配置统一从 `src/constants/wuxing.ts` 引用，颜色/间距走 `variables.scss` token，禁止魔法数字。**
- **新增网络调用前先看 `src/services/*.ts` 是否已封装，并同时维护 `USE_MOCK` 两条分支。**
- **组件 `.tsx` 里禁止出现 `wx.xxx`**，平台能力一律经 `services/` 抽象（为 App 化留路）。

### 提交规范（Conventional Commits）

```
feat: 新功能   fix: 修复   style: 样式   refactor: 重构   docs: 文档   chore: 杂项
```

------

## 备案与合规 ⚠️

- 小程序需主体备案；**音乐版权**需授权或自制（建议与原创音乐人合作）。
- **中医宣称**：UI 文案避免"治疗/治愈"等违反《广告法》的医疗宣称，"疗愈/安神"等谨慎使用。
- **服务条款**：明确标注「本应用提供的音乐为放松辅助，不替代医疗诊断」。

------

## 测试 CDKEY（`USE_MOCK` 模式下 `services/cdkey.ts` 内置）

```
WUXING-2026-FREE-30D  → 月悦体验卡 30天
MOON-LIGHT-VIP-365    → 年藏会员卡 365天
ZEROER-GIFT-7DAY      → 7日体验卡
```

> 真实后端下的可用兑换码由管理后台批量生成（种子数据也会写入一批测试码）。

------

## 参考资源

- 本仓库：[`README.md`](README.md)（如何跑）、[`backend/README.md`](backend/README.md)、[`admin/README.md`](admin/README.md)、[`docs/ROADMAP.md`](docs/ROADMAP.md)（版本路线图 + APP 更新接口契约）、根 `version.json`（机读版本清单）
- 原型预览：`prototype/wuxing-music-app.jsx`（React Web 版）
- Taro 文档：https://docs.taro.zone/ ｜ 微信小程序：https://developers.weixin.qq.com/miniprogram/dev/framework/

------

**最后更新**：H5 端（v1.1）登录/支付接入 + 版本管理基建（见 [`docs/ROADMAP.md`](docs/ROADMAP.md)）。
**当前阶段**：小程序 + H5（微信内）前端、后端管理/公开接口、管理后台均已完成；微信支付/公众号授权/短信/OSS 待真实配置上线验证。
