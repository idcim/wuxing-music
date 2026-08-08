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

> ⚠️ 本文档一度停留在"待初始化"阶段，现已按实际实现全面校正。运行/部署的**操作细节**见 [`README.md`](README.md)、[`backend/README.md`](backend/README.md)、[`admin/README.md`](admin/README.md)、[`docs/DEPLOY.md`](docs/DEPLOY.md)；本文件负责讲"**是什么 / 规范 / 数据结构 / 协作约定**"。
>
> 📖 **五行/五音的内容基准是 [`docs/WUXING-REFERENCE.md`](docs/WUXING-REFERENCE.md)**（飞书《五音对照知识》全文）。任何涉及五行对照、元素文案、测评题干的改动，**先改那份文档再改代码**；它同时规定了避免被判为养生医疗的三条硬约束。
>
> 🚀 **推到 `master` 即上线**：服务器上 1Panel 计划任务每分钟拉取本仓库并重建容器（见「部署与版本」）。提交前请确认改动可直接上生产。

本项目是一个 **monorepo**，三部分均已落地：

| 目录 | 角色 | 技术栈 | 状态 |
| ---- | ---- | ------ | ---- |
| `src/` | 小程序 / H5 前端 | **Taro 4.2 + React 18 + TS + Sass + Zustand** | 小程序主流程完成；H5（微信内）登录/支付已接入（v1.1），已容器化上服务器 |
| `backend/` | 后端 API（管理端 + 小程序/H5 公开端） | **FastAPI + SQLAlchemy + 外部 MySQL**（开发可 SQLite），Docker | 全套接口 + 微信支付/礼物码/统计 + RBAC + 限流已实现，待真实商户配置上线 |
| `admin/` | 管理后台 | **Vue3 + Vite + Element Plus + Pinia** | 18 个视图完成（含管理员/角色权限、设置中心） |

- **数据源开关**：`src/constants/env.ts` 的 `USE_MOCK`。当前 `false`；`API_BASE` 按端分支——**H5 为空串（同源反代，免 CORS）**，小程序用绝对地址 `https://app-api.azure-glow.cn`。置 `true` 可在无后端时本地跑通登录/曲目/兑换/支付/音频全链路。
- **已完成**：前端全部页面与播放体验、后端管理 CRUD、小程序公开接口对接、微信支付（JSAPI 统一下单 + 回调验签，逻辑已就绪）、CDKEY 兑换、买卡送人礼物码、订单/退款、聆听历史与周统计、海报小程序码、站点/存储/支付/小程序配置与文件上传（本地）。
- **已完成（H5 端，v1.1）**：H5（微信内）手机登录（短信验证码 + 手机号密码）、微信登录（公众号网页授权 OAuth2）、微信支付（公众号 JSAPI）；短信/公众号抽象层（未配则 dev 兜底）；版本管理基建（`version.json` + `docs/ROADMAP.md` + `src/constants/version.ts`）。详见 [`docs/ROADMAP.md`](docs/ROADMAP.md)。
- **已完成（后台与运维）**：管理员账号 + 角色权限（RBAC，权限点见 `backend/app/permissions.py`）；设置中心（站点/小程序/公众号/短信/存储/支付）；安全加固（`DEBUG` gate 收敛 dev fail-open、JWT 默认密钥守卫、短信/登录/兑换限流）；H5 容器化 + 1Panel 计划任务自动部署（健康检查 + 失败回滚）。
- **待补**：真实微信商户号 + 证书上线联调；真实公众号/小程序 AppSecret 配置后授权与 `code→openid` 生效验证；短信服务商密钥接入（抽象层已就位）；对象存储（OSS）上传接入（抽象层已就位）；生产 `.env` 落 `DEBUG=false` + 随机 `JWT_SECRET`；**剩余安全清单见 [`docs/ROADMAP.md`](docs/ROADMAP.md)**。
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
│   ├── pages/                  # 17 页（均为「页内 TabBar + redirectTo」而非原生 tabBar）
│   │   ├── splash/             #   启动页
│   │   ├── onboard/            #   引导页
│   │   ├── login/              #   登录
│   │   ├── quiz/               #   五行测评（4 题）
│   │   ├── result/             #   测评结果
│   │   ├── home/               #   首页（归处 / 本命曲目）
│   │   ├── explore/            #   探律（五行卡入口）
│   │   ├── element/            #   单元素详情（下钻曲目列表）
│   │   ├── tones/              #   五音对照（★ 知识页：角徵宫商羽横轴 + 五组文化维度 + 口诀）
│   │   ├── member/             #   会员（套餐 / 购买 / 买卡送人）
│   │   ├── profile/            #   我的
│   │   ├── userinfo/           #   资料编辑（昵称 / 头像）
│   │   ├── settings/           #   设置
│   │   ├── orders/             #   我的订单（购买记录 + 礼物码回看）
│   │   ├── history/            #   聆听历史 + 周统计
│   │   ├── player/             #   全屏播放器（旋转罗盘 / seek）
│   │   ├── agent/              #   代理中心（★ 仅代理可见，模块关闭时无入口）
│   │   └── about/              #   关于 / 条款
│   ├── components/             # 12 个：CdkeyModal / Icon / ListState / MiniPlayer / Playlist
│   │   │                       #        PosterShare / SeekBar / SleepTimer / TabBar / TrackCard
│   │   │                       #        UpgradePrompt / UserEditSheet
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
│   │   ├── wechat/             #   微信能力（分端：JS-SDK 签名 / chooseWXPay / 网页授权）
│   │   └── storage/            #   本地存储（index.ts，统一封装）
│   ├── constants/
│   │   ├── wuxing.ts           #   五行运行时数据（角徵宫商羽 / 五脏 / 曲目 / meta 文化维度 / 免责声明）
│   │   ├── quiz.ts             #   测评题库
│   │   ├── plans.ts            #   会员套餐兜底数据
│   │   ├── version.ts          #   前端版本常量（与根 version.json 对齐）
│   │   └── env.ts              #   USE_MOCK / API_BASE / TOKEN_KEY
│   ├── utils/                  # color / format / nav / platform / share / unit / url
│   ├── styles/variables.scss   # ★ design token（基色 / 圆角 / 间距 / 五行色 map）
│   ├── assets/                 # 图标 / 图片
│   └── types/index.ts          # 全量 TS 类型
├── backend/                    # FastAPI 后端
│   └── app/
│       ├── main.py             #   应用入口 + 路由挂载 + 建表
│       ├── config.py           #   .env 配置（DATABASE_URL / JWT / 管理员 / ★ DEBUG 开关）
│       ├── ratelimit.py        #   ★ 进程内滑动窗口限流（短信/密码登录/兑换失败）
│       ├── database.py         #   引擎 / Session / Base
│       ├── models.py           #   ★ 13 张表（见「后端数据模型」）
│       ├── permissions.py      #   ★ 后台权限点定义（RBAC 唯一来源）
│       ├── agent_service.py    #   ★ 代理分成：开关/归因/记账/冲正/余额（默认整体关闭）
│       ├── schemas.py          #   Pydantic 出入参 + ok() 信封
│       ├── security.py         #   密码哈希 / JWT / 管理员依赖
│       ├── seed.py             #   启动种子数据（五行/曲目/套餐/测评/测试兑换码/管理员）
│       ├── wxpay.py            #   微信支付统一下单 + 回调解密
│       ├── storage.py          #   本地 / OSS 存储抽象
│       └── routers/            #   auth / users / orders / plans / elements / tracks
│           │                   #   cdkeys / quiz / admins / settings / site / upload（管理端）
│           └── mp.py           #   ★ 小程序 + H5 公开端（/api/mp/*）
├── admin/                      # Vue3 管理后台
│   └── src/
│       ├── api/                #   接口封装（index.ts / request.ts）
│       ├── stores/auth.ts      #   Pinia 登录态
│       ├── menu.ts             #   ★ 侧边栏 + 权限点（路由守卫与布局共用一份）
│       ├── router/             #   路由
│       └── views/              #   18 视图（Login / Dashboard / Users / Orders / Plans
│                               #           Elements / Tracks / Cdkeys / Quiz / Admins / Roles
│                               #           Agents / Commissions / Withdrawals（★ 代理分成）
│                               #           SettingsCenter → Site / Storage / Settings(支付)
│                               #                            MpPanel / OaPanel / SmsPanel / AgentPanel）
├── prototype/
│   └── wuxing-music-app.jsx    # 原型参考（Web React 版）
├── config/index.ts             # ★ Taro 编译配置（h5.publicPath / devServer 代理 / postcss）
├── docker/                     # H5 前端容器：Dockerfile.h5 + h5.nginx.conf（同源反代 /api）
├── scripts/auto-deploy.sh      # ★ 1Panel 计划任务自动部署（拉取→重建→健康检查→失败回滚）
├── docs/                       # DEPLOY.md（部署与域名清单）/ ROADMAP.md（版本路线 + 安全清单）
│                               # WEAPP-TODO.md（★ 小程序端欠账清单，包不随自动部署，独立记账）
│                               # WUXING-REFERENCE.md（★ 五音对照知识：五行内容/文案唯一基准 + 合规红线）
├── version.json                # ★ 机读版本清单（app/api + 各端 + changelog）
├── docker-compose.yml          # 一键起 backend + admin + h5（连外部 MySQL）
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

**`DEBUG` 开关（后端，`backend/app/config.py`）** ⚠️：所有 dev fail-open 兜底（短信回传明文 `devCode`、未配商户时免付直开会员、登录游客兜底、种子公开测试 CDKEY）**统一由 `DEBUG` gate**——`DEBUG=false`（生产）时未配真实密钥一律**拒绝**而非放行；且 `JWT_SECRET` 仍是默认值时**后端拒绝启动**（`main.py` lifespan 守卫）。新增任何「未配置就放行」的兜底逻辑，必须挂在 `settings.debug` 下。
限流见 `backend/app/ratelimit.py`（进程内滑动窗口）：短信发送按 IP/小时 + 号码/日、密码登录与 CDKEY 兑换按失败次数。**多实例部署需换 Redis**（源码已注明）。

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

`variables.scss` 存 `$wuxing-colors` map 供样式循环；运行时数据（含频率/五脏/曲目/文化维度）在 `src/constants/wuxing.ts`。二者色值一致：

| 元素 | primary   | accent    | glow                    | 对应五脏 | 频率示例     |
| ---- | --------- | --------- | ----------------------- | -------- | ------------ |
| 木   | `#84cc16` | `#bef264` | `rgba(132,204,22,0.25)` | 肝胆     | 324Hz / 角调 |
| 火   | `#f97316` | `#fdba74` | `rgba(249,115,22,0.25)` | 心小肠   | 396Hz / 徵调 |
| 土   | `#eab308` | `#fde047` | `rgba(234,179,8,0.25)`  | 脾胃     | 528Hz / 宫调 |
| 金   | `#cbd5e1` | `#f1f5f9` | `rgba(203,213,225,0.2)` | 肺大肠   | 741Hz / 商调 |
| 水   | `#38bdf8` | `#7dd3fc` | `rgba(56,189,248,0.25)` | 肾膀胱   | 174Hz / 羽调 |

⚠️ **UI 主色刻意不等于传统五色**（青赤黄白黑）。深色冥想底下「水 = 黑/玄」作主色不可见、「火 = 正赤」对比过硬，所以只有土（黄）金（白）与正色重合。**五色作为文化字段存在 `meta.colorName`**，供文案取用。这是权衡过的，不是漏了——理由见 [`docs/WUXING-REFERENCE.md`](docs/WUXING-REFERENCE.md) 5.3。
⚠️ **174/396/528/741Hz 是现代频率疗法，飞书文档里没有这套对应**，是产品自己叠的一层。可以并行，但**文案上别说成"古法"，也别宣称频率有生理疗效**。

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

// 文化对照维度（33 项：五志/五神/简谱/调式/情绪转化/时间感/空间感…）
// 全部可选——后台是自由编辑的 JSON，缺键要能降级。键名见 docs/WUXING-REFERENCE.md 5.2
export interface ElementMeta { notation?: string; mode?: string; emotion?: string; transform?: string; /* …共 33 项 */ }

export interface WuxingElement {
  id: ElementId; en: string; icon: string;
  primary: string; accent: string; glow: string; bg: string;
  note: NoteName; notePinyin: string;
  organ: string; season: string; quality: string;
  desc: string; sleepTip: string;
  meta?: ElementMeta;        // 后端 element.meta（JSON 列）解析后下发
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

- 五行完整配置见 `src/constants/wuxing.ts`（含 `bg` 渐变、每元素曲目、`meta` 文化维度）。
- 测评题库见 `src/constants/quiz.ts`。
- ⚠️ **`wuxing.ts` 与 `backend/app/seed.py::ELEMENTS` 是同一份数据的两个副本**（后端镜像构建上下文是 `./backend`，读不到前端源码），改一处必须同步另一处；两者的内容基准都是 [`docs/WUXING-REFERENCE.md`](docs/WUXING-REFERENCE.md)。`quiz.ts` 与 `seed.py::QUIZ` 同理。
- ⚠️ **元素页/探律页/结果页直接 `import { WUXING }`，但读到的可能是后端数据**——`stores/content.ts` 的 `hydrate()` 拉完 `/api/mp/elements` 会**回写 `WUXING[id] = e`**。所以改后台的五行文案（含曲目 tag）对**已发布的旧小程序包也生效**；而 `quiz.ts` 这类纯常量、以及任何页面结构改动则必须重传包才更新（欠账见 [`docs/WEAPP-TODO.md`](docs/WEAPP-TODO.md)）。
- ⚠️ **「正在播放」语境一律按曲目所属元素取色，不要用用户体质**：`player` / `MiniPlayer` / `Playlist` 走 `stores/content.ts` 的 `getElementOfTrack(track, 用户体质)`（`track.elementId` → 扫曲库反查 → 兜底体质）。v1.8.0 前这三处都用 `WUXING[用户体质]`，火型用户听水的曲子会显示「徵音」+ 橙色背景。反过来，`TabBar` / `SleepTimer` / `CdkeyModal` 是**身份 chrome**，就该跟用户体质走，别一起改掉。

------

## 核心功能模块

### 1. 五行测评 `pages/quiz/`

4 题单选，顶部进度条；每题选项加分，末题算最高分元素并跳转 `result`，结果 `POST /api/mp/quiz` 同步后端 + 本地缓存。

```typescript
const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
```

⚠️ **题干只问情绪状态与感受偏好，不问身体症状**。v1.7.0 之前第 3 题是「您身体哪方面最需要调理？肝胆 · 眼睛 · 筋骨紧张」——那是问诊式题干，平台会判为养生医疗。现四题分别取材于 [`docs/WUXING-REFERENCE.md`](docs/WUXING-REFERENCE.md) 的**情绪失衡表现 / 情绪转化方向 / 音乐气质 / 适合画面**四行。加题改题照这个口径来。

### 1.5 五音理念的展现位（v1.8.0）

数据做完不等于产品做完 —— v1.7.0 把 33 项维度落了库，但只在「元素详情」这个二级页露出，
主路径上等于不存在。现在的分布是：

| 位置 | 展现内容 |
| ---- | -------- |
| `pages/home/` 「今夜之音」 | `meta.transform` + `sleepTip` + `meta.timeFeel · meta.imagery`（落地页第一屏） |
| `pages/explore/` 信息卡 | `sleepTip` 引文 + `meta.keywords` chips + 「五音对照 ›」入口 |
| `pages/player/` | `meta.mode · meta.musicMood`（按曲目所属元素） |
| `pages/element/` | 8 项文化网格 |
| `pages/tones/` ★ | 全部维度，分声音/天地/身心/心境/象征五组 + 口诀 + 免责 |
| `pages/result/` | `meta.transform` + `sleepTip` + 免责 |

`pages/tones/` 的分组由文件顶部的 `SECTIONS` 常量表驱动（`[中文名, keyof ElementMeta]`），
**后台把某项清空，那一行自动消失**；加维度只改这张表，别写 JSX 分支。
其中「身心对照」组固定带一行「以下为传统文化中的对应关系，非医学诊断或疗效说明」，
是 [`docs/WUXING-REFERENCE.md`](docs/WUXING-REFERENCE.md) 第一节第 2 条的硬约束，不要删。

### 2. 音频播放 `services/audio/`（分端）

- 小程序：`Taro.getBackgroundAudioManager()`（**用 BackgroundAudioManager 才能后台/锁屏播放**，`app.config.ts` 已配 `requiredBackgroundModes: ['audio']`）。
- H5：`index.h5.ts` 对应实现；统一接口见 `types.ts`。
- 非会员 **30 秒试听**：`previewSec` 到点由 `stores/player.ts::onTimeUpdate` **release 音源**（不是 pause——暂停后底层仍会把整包缓冲完），并经 `components/UpgradePrompt` 弹升级引导。
- ⚠️ **`isLoading` 绝不能有「进得去出不来」的路径**：播放器页 `toggle()` 首行是 `if (isLoading) return`，一旦 `isLoading` 卡在 true，播放键就永久失效、一直转圈，用户只能刷新。两条已修的坑：① 加载看门狗超时必须**同时**置 `isLoading:false`，只写 `loadError` 等于把按钮焊死；② `audioService.release()` 拆音源前先 `bound = {}`，否则元素收尾时吐的 `stalled`/`waiting` 会把 `isLoading` 重新置真，而没了音源 `canplay` 永不到达。新增任何 `set({isLoading:true})` 都要问一句「谁保证它会被清掉」。
- ⚠️ **「会员专属」不等于不能播**：付费曲目对非会员**照样点得动**，只是听到 `previewSec` 就断。列表页一律 `onPlay={() => onTrack(t.id)}`，**不要**再写成 `locked ? goMember() : onTrack(...)` —— v1.8.1 之前三个列表页都是那么写的，结果把曲目设成会员专属就等于彻底锁死，`player.ts` 里的断流逻辑和 `UpgradePrompt` 成了永远走不到的死代码。`TrackCard` 的 `locked` 只控制右侧的「试听 30s」徽标，**不控制能否播放**（也别再画锁头图标，那会让人以为点不动）。
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

### 8. 代理分成 ⭐（v1.5.0，**两级**，默认整体关闭）

面向**实体店**与**网络推手**的成交分成。核心逻辑收在 `backend/app/agent_service.py`
（不塞 `mp.py`，后者已 1500+ 行），管理端在 `routers/agents.py`。

**⚠️ 计酬封顶两级**——红线是「不得达到三级」，不是不能有二级。
`record_commission` **只走两跳（直推 + 其 parent_id），绝不递归向上**；
链可以更长（琴行→小李→小王），但小王的客户成交只付小王与小李，琴行 0。别加第三级。

**分成算法（v1.6.0 起是加法模型）：直推恒定拿满，上级加成由平台额外出**
```
direct = 订单额 × 直推的一级比例  = 100 × 20% = ¥20   ← 与有没有上级无关，恒定
bonus  = 订单额 × 上级的加成比例  = 100 ×  5% = ¥5    ← 平台额外支出
平台总支出 = ¥25（无上级时只出 ¥20，**会浮动**）
```
两条**各按订单额独立取整**，没有跨行不变量——别再写 `base − cut` 那种反算
（v1.5 的减法模型才需要，那时平台支出恒定）。对账口径按单汇总：
`平台支出 = SUM(commission.amount WHERE order_id=X AND status != 'void')`，
因此合计与 `订单额×(r1+r2)` 可能差 ±0.01（¥33.33 → 6.67+1.67=8.34），**这是可接受的**。

`rate2` 取**上级自己的** `commission_rate2`（配在上级身上：「我发展的下级，每单我多拿多少」）。
⚠️ 列名沿用 `rate2` 但**语义在 v1.6.0 反过来了**（旧义是"从下级那份里抽的占比"）。
同理全局配置键从 `default_rate2` 改名为 **`default_bonus_rate`**——
`agent_cfg` 是 `{**DEFAULTS, **saved}`，沿用旧键名的话存量库里存过的 `0.25`
会被当成"订单额的 25%"照旧生效，上级分成静默翻 5 倍。**别把键名改回去。**

**两个比例来自两个不同的代理行**，各自 `≤1` 也能相加超过 1（最坏赔付 200%）。
`record_commission` 里有运行时钳制：超了削**上级加成**而不是直推——
直推那个数是印在海报上跟人谈好的。全局默认值另有 `AgentSettingIn` 的
`model_validator` 挡一道（单个代理的覆盖值挡不住，只能靠运行时钳制）。

**上下级自动继承且永久**：用户设为代理时其 `user.agent_id` 即上级；只允许为空时补填，
不允许改指向（改绑等于把别人的下级抢走）。

**默认关闭要贯穿三层**，新增相关代码时三处都得挂上：
1. **接口**：`agent_service.require_enabled(db)` → 未开启回 **404**（不是 403，403 等于承认功能存在）。
   唯一例外 `GET/PUT /api/admin/settings/agent`——它是开启入口，挡住就没人能打开。
2. **记账**：`record_commission` 未开启时 **直接 return 不落库**。不是"记了不显示"，
   否则日后一开启会冒出一批历史欠账。
3. **界面**：后台菜单按 `/api/admin/me` 的 `features.agent` 过滤（`admin/src/menu.ts` 的
   `feature` 字段，路由守卫与 MainLayout 共用）；前端入口只在 `/api/mp/agent/me`
   回 `isAgent=true` 时渲染。
   ⚠️ `NAV_AGENT` 这一组是**逐项**门禁而非整组：「分成设置」**不带 feature**——
   它是模块唯一的开启入口，跟着开关一起藏就没人能打开了（v1.4 埋在设置中心 tab 里，实际找不到）。

**⚠️ `commission` 的唯一键是 `(order_id, level)` 复合的**，不是 `order_id` 单列——
一单要落两条。存量库的旧单列唯一索引由 `main.py::_fix_commission_index()` 换掉（幂等）。
**退款冲正必须 `.all()` 不能 `.first()`**，否则上级那条留在账上照样能提走。

**归因（首次扫码永久绑定）**：推广码进小程序码 `scene` / H5 链接 `?a=`，
`app.tsx` 的 `useLaunch` 里 `captureAgentCode()` **先落本地**（此时多半没登录），
绑定挂在 `stores/user.ts` 的 `setUser`——五条登录路径的唯一汇合点，
挂在每条路径上迟早漏一条。已绑不改绑、**拒绝代理绑自己**（防自购返佣）。
> 小程序 `scene` 是被 encodeURIComponent 过的，**必须先解码**再解析。

**分成**：挂在订单转 `paid` 的**两处**（支付回调 + `DEBUG` 下 dev 直开），与订单状态
**同一次提交**；幂等靠 `commission.order_id` 唯一约束（微信回调会重投）；
金额/比例存**成交时点快照**，改比例不回溯。冻结期满才可提现——
**不设 cron 解冻**，查余额时按 `available_at <= now` 判定。退款走 `void_commission` 冲正。

**提现**：金额以**服务端重算余额**为准（绝不信前端）；同一代理只允许一笔在途；
`with_for_update()` 行锁**只在 MySQL 生效，SQLite 是空操作**——并发用例只能在 MySQL 上验。
驳回/打款失败必须把金额**放回可提现池**（漏了余额会凭空消失）。
`payout_mode` 默认 `manual`（线下打款 + 后台标记）；`wxpay`（`wxpay.transfer`）需商户号
单独开通「商家转账」权限且**尚未真实验证**。

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
PATCH|POST /api/mp/profile      # 改昵称/头像/生日/时辰（同时支持 POST 规避代理对 PATCH 的 405）
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
POST /api/mp/qrcode/url         # 普通链接二维码（H5 海报用，小程序码 H5 扫了会跳出去）
# ── 代理分成（模块默认关闭；未开启时以下一律 404）──
POST /api/mp/agent/bind         # 绑定推广码（首次扫码永久绑定，已绑不改绑）
GET  /api/mp/agent/me           # 代理身份 + 余额 + 本月业绩（非代理回 isAgent:false）
GET  /api/mp/agent/commissions  # 我的分成明细（含 level / baseAmount）
GET  /api/mp/agent/downline     # 我的下级代理 + 推广用户数（只有一层）
POST /api/mp/agent/withdraw     # 申请提现（金额以服务端重算余额为准）
GET  /api/mp/agent/withdrawals  # 我的提现记录
```

### 管理端 `/api/admin/*`（需 Bearer；`admin/src/api/index.ts` 有全量封装）

```
GET  /api/admin/captcha            # 登录图形验证码（免鉴权，一次性消费）
POST /api/admin/login  GET /me  GET /dashboard   # 登录需带 captcha_id/captcha_code
GET  /users  GET /users/{id}  POST /users/{id}/grant                 # 用户 + 后台开通会员
GET  /orders GET /orders/{id} POST /orders/{id}/refund  .../refund/confirm  # 订单 + 退款
GET/POST /plans     DELETE /plans/{id}
GET/POST /elements  DELETE /elements/{id}
GET  /tracks POST /tracks  PUT/DELETE /tracks/{id}
GET  /cdkeys POST /cdkeys/generate  POST /cdkeys/{id}/disable
GET/POST /quiz  PUT/DELETE /quiz/{id}
GET/PUT /settings/pay | /settings/site | /settings/storage | /settings/mp | /settings/oa | /settings/sms
POST /settings/storage/migrate      # 存储迁移
POST /upload                        # 后台文件/封面/证书上传
GET/PUT /settings/agent             # 代理分成设置（★ 常驻，是模块唯一开启入口，不受开关门禁）
GET/POST /agents  PUT /agents/{id}  POST /agents/{id}/disable  GET /agents-summary  # 代理
GET  /agents/{id}/downline          # 下属：直接下级代理 + 名下用户（只看一层）
POST /users/{id}/agent              # ★ 把用户设为代理（上级按推广来源自动落定，不可改）
GET  /commissions                   # 分成明细（?level=1 直推 / 2 下级加成）
GET  /withdrawals  POST /withdrawals/{id}/approve | /reject | /paid                 # 提现审核
GET/POST /admins  PUT/DELETE /admins/{id}  POST /admins/{id}/password   # 管理员账号
GET/POST /roles   DELETE /roles/{id}   GET /permissions                 # 角色 + 权限点清单
```

**权限（RBAC）**：权限点定义在 `backend/app/permissions.py`（「模块:动作」，如 `tracks:edit`），
角色持有一组权限点，管理员绑角色；`admin.is_super` 为旁路开关，恒定拥有全部权限。
接口侧统一用 `security.require_perm("x:y")` 替代裸 `get_current_admin` 鉴权
（例外：`POST /upload` 仍是任意登录管理员可用——它同时服务歌曲与站点设置两边的上传）。
`GET /me` 返回 `{is_super, role_name, permissions}`，后台据此显隐菜单与路由，
但**真正的拦截在后端**，前端隐藏只是体验。
存量库升级由 `seed()` 兜底：若一个超管都没有，则把现存管理员全部提为超管，避免升级后被锁在门外。

------

## 后端数据模型（`backend/app/models.py`，SQLAlchemy）

> 早期文档写的是手工 MySQL DDL；**实际由 SQLAlchemy 模型声明，启动自动建表 + 种子数据**（`main.py::_auto_migrate` 会为已存在的表自动补加新列）。以下为 13 张表要点（`order` 是 MySQL 保留字，订单表名 `app_order`）：

| 表 | 说明 | 关键字段 |
| -- | ---- | -------- |
| `admin` | 管理员 | username / password_hash / is_active / **role_id** / **is_super** |
| `role` | 后台角色 | name / remark / permissions(JSON 权限点数组) / is_builtin |
| `element` | 五行配置（id=木火土金水） | primary/accent/glow/bg、note/organ/season、sleep_tip、**meta**（JSON，33 项文化对照维度；后台一个 JSON 文本框编辑，前后端各校验一次格式，`/api/mp/elements` 解析失败降级 `{}`） |
| `track` | 曲目 | element_id(FK)、hz、audio_url、cover_url、is_premium、preview_sec、is_online |
| `plan` | 套餐 | id(free/month/year/trial)、price、duration_days、features(JSON) |
| `user` | 用户 | openid/unionid/**oa_openid**/phone/**password_hash**、element、**birthday/birth_hour**、**agent_id/agent_bound_at**（代理归因，永久绑定）、membership_type/name/expire_at/source |
| `cdkey` | 兑换码 | code、batch_id、plan_type、status(unused/used/disabled/expired) |
| `cdkey_redeem_log` | 兑换日志 | user_id、cdkey_id、ip、device |
| `app_order` | 订单 | order_no、status(pending/paid/refunding/refunded…)、**is_gift/gift_code**、**refund_*** |
| `quiz_question` | 测评题 | q、options(JSON) |
| `setting` | KV 配置 | key/value（`pay_config`/`site_config`/`storage_config`/`mp_config`/`oa_config`(公众号)/`sms_config`(短信)） |
| `play_history` | 聆听历史 | user_id、track_id、played_at |
| `sms_code` | 短信验证码（手机登录） | phone、code、scene、expire_at、used、attempts（失败≥5 作废） |
| `agent` | ★ 代理（实体店/网络推手） | code(推广码)、type(store/promoter)、user_id(代理中心认人)、commission_rate(直推比例)/commission_rate2(**作为上级的加成比例，基数是订单额、平台额外出**；**null=跟随全局，0≠未设置**)、**parent_id(上级，永久不可改)**、status |
| `commission` | ★ 分成记录（一单最多两条） | agent_id、order_id、**level(1直推/2上级加成)**、**唯一键 (order_id, level)**、base_amount(**本单平台总支出=两条之和**，出参名 `platformCost`)、rate/amount(成交时点快照，**两条基数都是订单额**)、source_agent_id(二级行的来源下级)、status(pending→available→withdrawing→paid / void)、clawback |
| `withdrawal` | ★ 提现单 | agent_id、amount、status(pending→approved→paid / rejected / failed)、payout_mode、transfer_no |

------

## 管理后台 `admin/`（Vue3 + Element Plus）

页面（`admin/src/views/`）：登录、仪表盘、歌曲（分页/筛选/音频封面上传）、五行、套餐、兑换码（批量生成/导出/禁用）、测评、订单（详情+退单）、用户（详情+开通会员）、**设置中心 `SettingsCenter`**（站点 / 小程序 / **公众号** / **短信** / 文件存储 / 支付，含 LOGO/证书上传）、**系统管理（管理员账号 + 角色权限矩阵）**。默认管理员 `admin` / `admin123`（由 `backend/.env` 覆盖），首次启动即为超级管理员。

侧边栏导航定义在 `admin/src/menu.ts`，**路由守卫与 MainLayout 共用同一份**（含各项所需权限点），避免菜单与鉴权走偏；新增后台模块时改这一处即可。

------

## 部署与版本

> 操作细节（首次部署步骤、`.env` 字段、域名清单、上线检查单）以 [`docs/DEPLOY.md`](docs/DEPLOY.md) 为准；此处只讲拓扑与约定。

### 拓扑（`docker-compose.yml`，三个容器 + 外部 MySQL）

| 组件 | 容器 | 端口 | 说明 |
| ---- | ---- | ---- | ---- |
| 后端 API | `wuxing-backend` | 8000 | `/api/mp/*` 公开端 + `/api/admin/*` 管理端；健康检查 `GET /api/health`（★ 同时回显版本与提交号，见下） |
| 管理后台 | `wuxing-admin` | 8080 | Nginx 托管，`/api` 反代到后端（同源无跨域） |
| H5 前端 | `wuxing-h5` | 8081 | `docker/Dockerfile.h5` 内跑 `build:h5`，Nginx 托管产物 + 反代 `/api`、`/uploads` |
| MySQL | 外部（`1panel-network`） | 3306 | 不随 compose 起落，单独维护 |
| 小程序 | `dist/`（`build:weapp`） | — | 微信开发者工具上传，不走服务器 |

- **H5 的 `API_BASE` 为空字符串（同源）**：`src/constants/env.ts` 按 `process.env.TARO_ENV` 分支，H5 走容器内 nginx 反代，因此 **H5 不需要 CORS、换域名也不必改前端**；那个绝对地址只服务小程序端。
- H5 构建镜像必须用 **glibc 基底**（`node:22-slim`），alpine 下 Taro/Vite 的原生绑定装不上。

### 自动部署（`scripts/auto-deploy.sh`）

拉取式部署，由 **1Panel 计划任务**定时调用（非 GitHub Actions）：检测远程有新提交 → `git pull` → `docker compose up -d --build` → 轮询 `/api/health` → **失败自动回滚到上个 commit 并重建**。带文件锁防并发重入，无更新则立即退出（幂等，可每分钟跑）。行为通过环境变量覆盖（`WUXING_REPO_DIR` / `WUXING_BRANCH` / `WUXING_HEALTH_URL` / `WUXING_ROLLBACK` …）。

⚠️ **脚本开头的「自我复制再执行」不是冗余，别删**。`git reset --hard` 会重写正在执行的本文件，而 bash 按字节偏移边读边执行——实测后果不是"少跑一行"，而是**先把某行残段当命令执行，再从头把整个脚本又跑一遍，且最终 exit 0**（cron 完全看不出异常）。对本脚本意味着 `compose up --build` 与回滚逻辑可能重复执行。跑副本后 `git reset` 改的只是磁盘原件。该段必须在 `flock` **之前**，否则父子进程互抢锁。
⚠️ **`flock` 缺失要显式报错**，不能沿用 `if ! flock` 一把兜：那样它不存在时会走进「已有部署进程在运行 → exit 0」，**每次静默跳过、永远返回 0**，日志还写着一句骗人的话。

**推论：推到 `master` 即上线。** 提交前请确认改动可直接上生产；日志在 `/var/log/wuxing-deploy.log`。

**怎么从外部确认部署生效**（不用登服务器）：`GET /api/health` 是公开免鉴权的，返回

```json
{"code":0,"data":{"status":"ok","version":"1.6.0","api":"1.3.0",
                  "commit":"a7d46ea","builtAt":"…","startedAt":"…"},"msg":"ok"}
```

**看 `commit` 而不是 `version`**——文档类改动不 bump 版本号，只盯 `version` 会误判成没上去；
`startedAt` 则能看出容器有没有真的重建过。`commit`/`builtAt` 由 `scripts/auto-deploy.sh`
在 `compose up` 前 `export`、经 `docker-compose.yml` 的 `environment` 注入，**本地手动起是空串**。
⚠️ 回滚分支里必须重新 `export`（那时 HEAD 已经变了），否则回滚后 health 还报着新提交号。

### 版本

根 `version.json` 是**机读的唯一版本源**（`current.app` / `current.api` + 各端 `channels` + `changelog`），前端常量 `src/constants/version.ts` 与之对齐，APP 更新接口契约见 [`docs/ROADMAP.md`](docs/ROADMAP.md)。**当前 v1.6.0**。发版时同步改**五处**：`version.json`、`package.json`、`src/constants/version.ts`、**`backend/app/version.py`**、`docs/ROADMAP.md`（v1.2.0 曾漏改 `version.ts` 的 `API_VERSION`）。

> 后端为什么另存一份而不读 `version.json`：后端镜像的构建上下文是 `./backend`（见 `docker-compose.yml`），根目录的 `version.json` **进不到容器里**。这份重复是为了让 `/api/health` 能报版本，代价是发版多改一处。

⚠️ **`channels.weapp` 是唯一会与源码版本脱节的一栏**：H5/后端/后台推 `master` 即自动部署，
小程序包却要手工上传，所以该栏另有 `published` 字段记录**线上实际发布的版本**；
未上传前它会一直落后于 `version`。欠账明细见 [`docs/WEAPP-TODO.md`](docs/WEAPP-TODO.md)。

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
- [x] 安全加固：`DEBUG` gate 收敛全部 dev fail-open、JWT 默认密钥守卫、短信/登录/兑换限频、依赖 CVE 升级
- [x] H5 容器化（Nginx 同源反代）+ 1Panel 计划任务自动部署（健康检查 + 失败回滚）
- [ ] APP 更新接口（契约已定，随 APP 阶段实现）

### 待补（上线前）
- [ ] 真实微信商户号 + 证书上线联调（后台可配）
- [ ] 真实 AppSecret 配置后 `code→openid` 生效验证
- [ ] OSS 上传接入（抽象层已就绪）
- [ ] 生产 `.env` 落 `DEBUG=false` + 随机 `JWT_SECRET`（剩余项见 [`docs/ROADMAP.md`](docs/ROADMAP.md) 安全清单）

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
14. **`<Input>` 禁止条件渲染切换形态**（Taro H5 `taro-input-core` 两个坑）：① 节点被 React 复用时**不刷新 `type` / `placeholder`**——登录页曾因此把密码框渲染成 `type=number` 明文框；② **首屏之后才挂载的实例根本不渲染内部 `<input>`**，所以加 `key` 强制重挂载反而让整个框消失。正解：**两个 Input 都常驻，切换只改 `display`**（见 `src/pages/login/index.tsx`）。
15. **输入框字号必须 ≥ 32rpx**：30rpx 在 ≤400px 视口下算出来不到 16px，iOS Safari / 微信 WKWebView 聚焦时会**强制放大整个页面**；32rpx = 0.8rem，在 375px 视口（根字号被钳在 20px）正好 16px 达标。
16. **聚焦高亮用纯 CSS，别用 `onFocus` + state**：`focus → setState → 重渲染 → 再触发 focus` 会把渲染进程直接卡死。用 `:focus` 与 `:focus-within` 两条选择器覆盖两端——小程序端类名落在原生 `input` 上，H5 端落在外层 `taro-input-core`（真 `input` 是其子节点）。另：placeholder 颜色小程序只认 `placeholderStyle` 属性，不吃 `::placeholder`。
17. **`Taro.showModal({ editable: true })` 是小程序专有，H5 上等于没有**：`taro-h5` 的 `showModal` 既不认 `editable` / `placeholderText`（连默认值合并都没有），成功回调也**只返回 `{ cancel, confirm }`，没有 `content`**（弹窗内容是 `textContent` 纯文本节点，压根没有 `<input>`）。于是 `res.content` 恒为 `undefined`，`if (!res.content) return` 直接静默吞掉——用户点确定什么也不会发生、也没有任何提示。**需要用户输入的一律自绘页内抽屉**（见 `src/components/UserEditSheet/`），别用 `showModal` 收输入。
18. **一批小程序 API 在 H5 上「存在但不可用」，甚至会假报成功**——`if (Taro.xxx)` 这种存在性判断挡不住它们：
    - `getMenuButtonBoundingClientRect`：H5 有同名导出，但是 `temporarilyNotSupport` 存根，调用会 `console.warn` 并返回 Promise。且 H5 的 `statusBarHeight` 是 **`NaN`**。两者叠加让 `getNavTop()` 恒返回 64，白白吃掉每页顶部 64px（已由 `utils/nav.ts` 的 `navTopStyle()` 分端修掉）。
    - `getAccountInfoSync`：H5 不支持 → 版本号恒显示「—」，改用 `constants/version.ts` 的 `APP_VERSION`。
    - `getStorageInfoSync()`：H5 只返回 `keys`，`currentSize` / `limitSize` 都是 `NaN` → 缓存大小恒显示 0KB，H5 干脆别显示。
    - `saveImageToPhotosAlbum`：H5 实现是 `<a download>` 合成点击，微信内置浏览器会拦掉，**但它总是回调 `success`** → 提示「已保存到相册」而其实什么都没存。H5 应引导「长按图片保存」。
    - `showShareMenu`：H5 是存根，直接调用会**抛异常**（`utils/share.ts` 已加 `isWeapp` 守卫）。H5 的分享要走公众号 JS-SDK 的 `updateAppMessageShareData`（尚未接）。
19. **H5 上 `redirectTo` = `history.replaceState`，切页不留历史**：TabBar 四个 tab 原本一律 `redirectTo`，H5（hash 路由）下用户「归处→探律→会员」后按微信/浏览器后退键会**直接退出整个站点**而不是回到上一个 tab。现按端分支：小程序仍 `redirectTo`（对齐原生 tabBar 语义），H5 改为「目标 tab 已在 `Taro.getCurrentPages()` 里就 `navigateBack(delta)`、否则 `navigateTo`」——既留历史又不会把页面栈撑爆。注意 `getCurrentPages()` 里的 `route` **带前导斜杠**（`/pages/home/index`），比对前要归一化。
20. **二级页的返回键必须兜底**：H5 可由分享链接/刷新直接进任意二级页，此时页面栈只有当前页，裸 `Taro.navigateBack()` 会**静默失败**（且 Taro H5 的 `navigateBack` 不保证 reject，`.catch()` 兜底也不会触发），用户被困在页面里。统一用 `utils/nav.ts` 的 `goBack(fallback)`：栈深 ≤1 时 `reLaunch` 回首页。

21. **别再用 `Taro.createCanvasContext`（旧画布 API）**：它在 H5 shim 里**设置立即生效、绘制却入队**——`setFontSize` / `setTextAlign` 直接写 `ctx`，`fillText` 却排队等 `ctx.draw()` 回放。于是回放时所有文字都用**最后一次**设的字号，整张海报的字全变成同一个大小（v1.5.1 前 H5 海报正是如此，「木」140px 被压成 24px）。另外 H5 的 `canvasToTempFilePath` 源码里写着 `@todo 暂未支持尺寸相关功能`，**`destWidth/destHeight` 是无效参数**，导出恒为 1x。一律改用 **Canvas 2D**（`<Canvas type="2d">` + `getContext('2d')`，立即模式）：小程序用 `createSelectorQuery().fields({node:true})` 取节点、导出传 `{canvas}`；H5 直接拿 DOM 里的 `<canvas>`、`toDataURL()` 导出。两端都要自己按 `pixelRatio`/`devicePixelRatio` 设背板再 `ctx.scale(dpr,dpr)`，否则一样糊。⚠️ H5 上 Taro 的 Canvas 组件会在 `componentDidRender` 里按计算样式**回写** `canvas.width/height`，DPR 背板必须在**取到节点之后**再设一次。另：`ctx.roundRect` 在小程序 2D 不保证有，圆角自己用 `arcTo` 画。参考实现见 `src/services/poster/`。

22. **别用 Taro 的 `<Slider>`**（v1.8.1 已换掉，进度轴见 `src/components/SeekBar/`）。看它的源码 `node_modules/@tarojs/components/dist/collection/components/slider/slider.js` 就明白为什么它「拉不动」：① `componentDidLoad` 只把 `touchstart/touchmove/touchend` 绑在 **`this.handler`（那个圆点）** 上——**轨道上点按拖动一概无效**，必须精准摁住圆点，而 `blockSize` 上限 28、我们当时传 16，命中区只有 16px；② **完全没有 mouse/pointer 监听**，桌面浏览器里 100% 拖不动；③ `value` 上挂着 watcher，属性一变就 `updateByStep()` 重置内部 percent，而播放器每秒推好几次 `currentTime`，**拖到一半会被播放进度拽回去**。自绘时三件事都要办到：命中区做成**真实的高盒子**（`::before` 撑出来的区域在小程序端不参与父节点触摸命中）、拖动期间用本地状态渲染并忽略外部 value、H5 另经 DOM 补鼠标监听（Taro 的组件 props 只声明了 touch 系列，没有 mouse）。
23. **H5 输入框文字会贴着框顶**：Taro 把 `className` 落在外层 `taro-input-core` 上，它是 `display: block`；而内层真正的 `<input class="weui-input">` 被 Taro 自带样式把高度钉死在 **`1.47059em`**（约 23px）。于是给外层设的 96rpx 高度只撑开了盒子，真 input 作为块级子元素贴在顶部、下方空一大截。`src/app.scss` 已加一条全局 `taro-input-core { display: flex; align-items: center }` 兜住所有输入框（小程序端没有这个标签，规则不命中）。**给输入框设高度时不必再各自处理垂直居中**。

> 本地验证的坑：`npm run dev:h5` 起的 dev server 与 `python -m http.server` 托管的 `build:h5` 产物里，`taro-input-core` 都**不渲染内部 `<input>`**（新建实例也一样，`document.querySelectorAll('input').length === 0`），登录页这个已上线可用的页面同样如此。也就是说**输入框相关的行为无法在本地浏览器复现验证**，只能上真机/真环境看。排查 Input 问题时别被本地现象误导。
>
> ⚠️ 更进一步（v1.8.1 排查所得）：**所有 stencil 组件在自动化/无头浏览器里都报 `hydrated: false`**——`taro-view-core`、`taro-text-core` 也一样，而页面明明正常显示。所以「某个 Taro 组件没水合/宽度为 0」这类观察**不能作为线上有问题的证据**。定位这类问题请直接读 `node_modules/@tarojs/components` 里的源码，结论与环境无关。

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

### 写文案的三条硬约束（v1.7.0 起，出自 [`docs/WUXING-REFERENCE.md`](docs/WUXING-REFERENCE.md) 第一节）

内容方在飞书原文里写着：「容易被平台误判成养生医疗，可以讲文化，但不要讲成'吃什么治什么'」。

1. **讲文化，不讲疗效。** 面向用户的文案走「音乐气质 / 情绪转化方向 / 适合直播讲法」三行的口径。
   ✅「角音像春天的风，让人慢慢舒展开。」 ❌「疏肝理气」「柔肝宁神」「引火归元」这类治疗动宾结构。
2. **五脏/五味/五谷只作文化对照展示，不与"改善/治疗"连用。** 可以标注，不可以承诺。
3. **测评只问情绪与感受，不问身体症状。** 问诊式题干（「肝胆·眼睛·筋骨紧张」）已清除，别再加回来。

免责声明常量 `WUXING_DISCLAIMER`（`src/constants/wuxing.ts`）在**结果页与关于页常驻**，
硬编码而非读后台「关于我们」——后者可能被清空。新增展示五行/五脏对照的页面时一并挂上。

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

- 本仓库：[`README.md`](README.md)（如何跑）、[`backend/README.md`](backend/README.md)、[`admin/README.md`](admin/README.md)、[`docs/DEPLOY.md`](docs/DEPLOY.md)（部署 + 域名清单 + 上线检查单）、[`docs/ROADMAP.md`](docs/ROADMAP.md)（版本路线图 + APP 更新接口契约 + 安全加固清单）、[`docs/WEAPP-TODO.md`](docs/WEAPP-TODO.md)（小程序端欠账清单）、**[`docs/WUXING-REFERENCE.md`](docs/WUXING-REFERENCE.md)（★ 五音对照知识：五行内容与文案的唯一基准 + 合规红线）**、根 `version.json`（机读版本清单）
- 内容来源：飞书知识库《五音对照知识》 <https://icnjykc5ztnv.feishu.cn/wiki/TSYAweh2liTheBkwohEcNQnenxe>（已全文落地为上面那份文档，表格是 canvas 渲染的，页面上复制不出来）
- 原型预览：`prototype/wuxing-music-app.jsx`（React Web 版）
- Taro 文档：https://docs.taro.zone/ ｜ 微信小程序：https://developers.weixin.qq.com/miniprogram/dev/framework/

------

**最后更新**：修试听断流后播放键永久转圈（看门狗未解除 `isLoading` + `release()` 未摘回调）。
**当前版本**：v1.8.2（见根 `version.json`）。
**当前阶段**：小程序 + H5（微信内）前端、后端管理/公开接口、管理后台均已完成，三容器已上服务器且推 `master` 即自动部署；微信支付/公众号授权/短信/OSS 待真实配置上线验证。
⚠️ **小程序包不随自动部署**，欠账（合法域名、待真机验证项、未接的微信原生能力、审核合规）单独记在 [`docs/WEAPP-TODO.md`](docs/WEAPP-TODO.md)。
