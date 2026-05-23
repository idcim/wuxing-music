# 五行律音 · 安神助眠音乐小程序

## 项目概述

**五行律音** 是一款基于中医五行学说的会员制助眠音乐小程序，通过体质测评为用户匹配专属音律方案，结合古传五音疗愈理论（角徵宫商羽）与现代频率疗法（174Hz/396Hz/528Hz/741Hz等），提供个性化的安神、助眠、冥想音乐内容。

### 核心价值

- **个性化**：通过 4 题快速测评定位用户五行体质偏向
- **专业性**：每首曲目对应五脏、季节、频率，有理论依据
- **沉浸感**：深色冥想氛围 + 高级时尚视觉
- **变现路径**：免费试听 → 月卡 → 年卡 + CDKEY 兑换

------

## 技术栈推荐

### 方案 A：Taro 3 + React（推荐）

React 写法直接接近现有原型，跨端能力强。**Taro 3.2+ 官方支持 React Native**，一套代码可同时编译到微信小程序、H5、iOS、Android。本项目从立项起即按跨端友好原则组织代码，详见末尾「未来扩展到 App」章节。

```
- Taro 3.x（要求 3.2+ 以支持 RN）
- React 18 + Hooks
- TypeScript
- Zustand（状态管理）
- NutUI-React-Taro（多端组件库，比 Taro UI 更适合 RN）
- Less / Sass
```

### 方案 B：原生微信小程序

体积小、性能好，但开发效率低于 Taro。

```
- WXML + WXSS + JS/TS
- MobX-miniprogram（状态管理）
- vant-weapp（组件库）
```

### 方案 C：uni-app（Vue 派）

若团队偏 Vue，多端发布友好。

**本文档以方案 A（Taro + React）为主线展开**。

------

## 项目结构

```
wuxing-music/
├── src/
│   ├── app.config.ts           # 全局配置
│   ├── app.tsx                 # 入口
│   ├── app.less                # 全局样式
│   ├── pages/
│   │   ├── splash/             # 启动页
│   │   ├── onboard/            # 引导页
│   │   ├── quiz/               # 五行测评
│   │   ├── result/             # 测评结果
│   │   ├── home/               # 首页（归处）
│   │   ├── explore/            # 探律
│   │   ├── member/             # 会员
│   │   ├── profile/            # 我的
│   │   └── player/             # 全屏播放器（次要）
│   ├── components/
│   │   ├── TrackCard/          # 曲目卡片
│   │   ├── MiniPlayer/         # 底部迷你播放器
│   │   ├── TabBar/             # 自定义 tabBar
│   │   ├── CdkeyModal/         # 兑换码弹窗
│   │   ├── ElementBadge/       # 五行徽章
│   │   └── WaveBar/            # 播放波形动画
│   ├── stores/
│   │   ├── user.ts             # 用户 / 会员状态
│   │   ├── player.ts           # 播放器状态
│   │   └── content.ts          # 曲目库 / 五行数据
│   ├── services/
│   │   ├── api.ts              # API 封装
│   │   ├── auth.ts             # 登录鉴权
│   │   ├── pay/                # 支付（分平台）
│   │   │   ├── index.ts        # 统一入口
│   │   │   ├── pay.weapp.ts    # 微信小程序支付
│   │   │   └── pay.rn.ts       # RN 端支付（IAP / H5）
│   │   ├── audio/              # 音频（分平台）
│   │   │   ├── index.ts        # 抽象接口
│   │   │   ├── audio.weapp.ts  # wx.createInnerAudioContext
│   │   │   └── audio.rn.ts     # react-native-track-player
│   │   ├── storage/            # 存储（分平台）
│   │   │   ├── index.ts
│   │   │   ├── storage.weapp.ts
│   │   │   └── storage.rn.ts
│   │   └── cdkey.ts            # 兑换码
│   ├── constants/
│   │   ├── wuxing.ts           # 五行配置数据
│   │   └── quiz.ts             # 测评题目
│   ├── utils/
│   │   ├── audio.ts            # 音频管理
│   │   ├── storage.ts          # 本地存储
│   │   └── format.ts           # 格式化工具
│   ├── assets/
│   │   ├── icons/              # 图标（PNG/SVG，小程序不支持lucide）
│   │   └── images/             # 图片资源
│   └── types/
│       └── index.d.ts          # TS 类型声明
├── prototype/
│   └── wuxing-music-app.jsx    # 原型参考（Web React 版）
├── project.config.json
├── tsconfig.json
└── package.json
```

------

## 设计系统

### 字体（小程序需嵌入或降级）

小程序无法直接用 Google Fonts，需要替代方案：

**方案 1：使用系统字体降级**

- 中文：`PingFang SC, 苹方-简, system-ui`
- 数字/英文小标：`-apple-system, SF Pro Display`
- 衬线（标题）：`STSong, SimSun`（系统衬线，效果约等于 Noto Serif SC）

**方案 2：自定义字体（推荐）**

- 通过 `wx.loadFontFace()` 加载 CDN 上的 woff2
- 必须开启 `scopedSlots`，仅支持 `.ttf` / `.woff`
- 字体文件需托管在 HTTPS，建议放对象存储（OSS / COS）

```js
wx.loadFontFace({
  family: 'CormorantGaramond',
  source: 'url("https://cdn.yourdomain.com/fonts/Cormorant.woff2")',
  scopes: ['webview', 'native']
});
```

### 配色系统

#### 全局基色

```less
@bg-deep: #03050a;        // 最深底
@bg-mid: #0a0e1a;         // 中间底
@text-primary: #e2e8f0;   // 主文字
@text-secondary: #94a3b8; // 次文字
@text-tertiary: #64748b;  // 辅助文字
@text-quaternary: #475569;// 弱化文字
@border: rgba(255,255,255,0.06);
@surface: rgba(255,255,255,0.025);
```

#### 五行色板（必备核心数据）

| 元素 | primary   | accent    | glow                    | 对应五脏 | 频率示例     |
| ---- | --------- | --------- | ----------------------- | -------- | ------------ |
| 木   | `#84cc16` | `#bef264` | `rgba(132,204,22,0.25)` | 肝胆     | 324Hz / 角调 |
| 火   | `#f97316` | `#fdba74` | `rgba(249,115,22,0.25)` | 心小肠   | 396Hz / 徵调 |
| 土   | `#eab308` | `#fde047` | `rgba(234,179,8,0.25)`  | 脾胃     | 528Hz / 宫调 |
| 金   | `#cbd5e1` | `#f1f5f9` | `rgba(203,213,225,0.2)` | 肺大肠   | 741Hz / 商调 |
| 水   | `#38bdf8` | `#7dd3fc` | `rgba(56,189,248,0.25)` | 肾膀胱   | 174Hz / 羽调 |

### 圆角与间距

- 卡片圆角：`16-24rpx`（小卡）/ `32-44rpx`（大卡）
- 按钮圆角：`40-60rpx`（胶囊）
- 内边距：`44rpx`（外）/ `28-36rpx`（卡内）
- 列表间距：`20rpx`

### 动效

- 进场：`fadeUp 0.6s cubic-bezier(0.16,1,0.3,1)`
- 旋转：罗盘元素 `rotate-slow 30-40s linear infinite`
- 波形：播放波形 `scaleY 0.5-1`
- 星点：`star-twinkle 2-5s ease-in-out`

### 图标方案

**lucide-react 在小程序不可用**，需要替换：

- 推荐：`iconfont`（阿里巴巴矢量图标库）批量下载 SVG → 用 `image` 标签引用，或导出字体图标
- 备选：`@taro-icons/lucide`（社区移植版）
- 颜色控制：SVG 通过 `currentColor` 或 image 的 mode

需要的图标清单：

```
Sprout, Flame, Mountain, Gem, Droplets (五行)
Play, Pause, Heart, Download, ListMusic (播放)
Crown, Gift, KeyRound, Check, X, Zap (会员/兑换)
Home, Compass, User, ChevronRight, ArrowRight (导航)
Moon, Sparkles, Star, Timer, Volume2 (装饰/功能)
TrendingUp, BarChart3, History, Settings (统计/设置)
```

------

## 核心数据结构

### 五行配置 `src/constants/wuxing.ts`

```typescript
export interface WuxingElement {
  id: '木' | '火' | '土' | '金' | '水';
  en: string;
  icon: string;              // iconfont class 或 SVG 路径
  primary: string;
  accent: string;
  glow: string;
  bg: string;                // radial-gradient
  note: '角' | '徵' | '宫' | '商' | '羽';
  notePinyin: string;
  organ: string;             // 对应五脏
  season: string;
  quality: string;           // 五行特性
  desc: string;              // 一句话疗效
  sleepTip: string;          // 详细说明
  tracks: Track[];
}

export interface Track {
  id: number;
  title: string;
  duration: string;          // "MM:SS"
  durationSec: number;       // 用于实际播放
  hz: string;                // "324Hz" 或 "角调"
  tag: string;               // "深度睡眠" / "助眠冥想"
  plays: string;             // "12.4k"
  audioUrl: string;          // CDN 地址
  coverUrl?: string;
  isPremium: boolean;        // 是否会员专属
  previewSec?: number;       // 免费试听秒数
}
```

完整数据见原型文件 `prototype/wuxing-music-app.jsx` 中的 `WUXING` 对象。

### 测评题目 `src/constants/quiz.ts`

```typescript
export interface QuizQuestion {
  q: string;
  opts: {
    text: string;
    score: Partial<Record<'木'|'火'|'土'|'金'|'水', number>>;
  }[];
}
```

4 道题，每题选项加分映射，最终求 max 决定主体质（原型已有完整题库）。

### 用户模型

```typescript
export interface User {
  id: string;
  openid: string;            // 微信 openid
  unionid?: string;
  nickname: string;
  avatar: string;
  element: '木'|'火'|'土'|'金'|'水' | null;
  elementScores: Record<string, number>;
  quizCompletedAt: string | null;
  membership: Membership;
  createdAt: string;
}

export interface Membership {
  type: 'free' | 'month' | 'year' | 'trial';
  name: string;              // 显示名："听闻"/"月悦"/"年藏"
  startAt: string | null;
  expireAt: string | null;
  source: 'purchase' | 'cdkey' | 'gift' | null;
}
```

------

## 页面流转

```
splash (2s)
  ↓
onboard ─────────── (跳过) ──────────┐
  ↓                                   ↓
quiz (4题)                          main
  ↓                              ┌────┴────┬─────────┬──────────┐
result                          home   explore   member    profile
  ↓                              │         │         │           │
main ←──────────────────────────┴─────────┴─────────┴───────────┘
                                                │           │
                                          CdkeyModal ←──────┘
```

### 关键状态字段

- `currentPage`：`splash | onboard | quiz | result | main`
- `activeTab`：`home | explore | member | profile`
- `currentTrack`：当前播放曲目
- `isPlaying`、`progress`、`timerVal`
- `cdkeyModalOpen`、`cdkeyStatus`

------

## 核心功能模块

### 1. 五行测评 `pages/quiz/`

- 4 题单选，进度条顶部
- 每题选项点击 → 加分 → 下一题
- 最后一题完成 → 计算最高分元素 → 跳转 result
- 体质结果存入本地 + 同步后端

**算法**：

```typescript
const top = Object.entries(scores)
  .sort((a, b) => b[1] - a[1])[0][0];
```

### 2. 音频播放

小程序原生：`wx.createInnerAudioContext()`

```typescript
const audio = wx.createInnerAudioContext({ useWebAudioImplement: false });
audio.src = track.audioUrl;
audio.autoplay = true;

// 关键事件
audio.onPlay(() => setIsPlaying(true));
audio.onPause(() => setIsPlaying(false));
audio.onTimeUpdate(() => {
  setProgress(audio.currentTime / audio.duration * 100);
});
audio.onError((err) => console.error(err));

// 非会员限制：30 秒预览
if (!user.isPremium && audio.currentTime > 30) {
  audio.pause();
  showUpgradeModal();
}
```

**注意事项**：

- 后台播放需配置 `requiredBackgroundModes: ['audio']`
- 必须用 `BackgroundAudioManager` 才能锁屏继续播放
- iOS 静音模式需要 `obeyMuteSwitch: false`

### 3. 睡眠定时器

四档预设：15 / 30 / 45 / 60 分钟

```typescript
// 设置后启动 setTimeout
const timerId = setTimeout(() => {
  audio.stop();
  setIsPlaying(false);
  setTimerVal(null);
}, timerVal * 60 * 1000);

// 切换/取消时清除
clearTimeout(timerId);
```

### 4. CDKEY 兑换系统 ⭐

**前端流程**：

```
点击入口（3 处：首页 / 会员页 / 我的）
  → 弹出底部抽屉
  → 输入 CDKEY（自动大写）
  → 点击「立即兑换」
  → 调用 /api/cdkey/redeem
  → 三态展示：
     ✓ success: 显示卡名 + 天数，刷新会员状态
     ✗ error:   提示无效，可重试
     ⊙ used:    提示已使用
  → 关闭弹窗 → 全局刷新
```

**后端接口**：

```http
POST /api/cdkey/redeem
Body: { cdkey: string }
Auth: Bearer <token>

Response 成功:
{
  "code": 0,
  "data": {
    "plan": "年藏会员卡",
    "type": "year",
    "days": 365,
    "expireAt": "2026-12-31T23:59:59Z"
  }
}

Response 失败码:
- 40001: CDKEY 不存在
- 40002: CDKEY 已被使用
- 40003: CDKEY 已过期
- 40004: 该账户已绑定过同类型卡
```

**数据库表结构**：

```sql
CREATE TABLE cdkey (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(32) UNIQUE NOT NULL,    -- 兑换码
  batch_id VARCHAR(64),                 -- 批次号
  plan_type ENUM('month','year','trial') NOT NULL,
  duration_days INT NOT NULL,
  plan_name VARCHAR(64) NOT NULL,
  status ENUM('unused','used','expired','disabled') DEFAULT 'unused',
  used_by BIGINT NULL,                  -- 用户ID
  used_at DATETIME NULL,
  expire_at DATETIME NULL,              -- 兑换码本身有效期
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  remark VARCHAR(255),
  INDEX idx_status (status),
  INDEX idx_batch (batch_id)
);

CREATE TABLE cdkey_redeem_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  cdkey_id BIGINT NOT NULL,
  redeem_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip VARCHAR(45),
  device VARCHAR(255)
);
```

**生成规则**（管理端）：

```
格式：{前缀}-{年份}-{4位随机}-{4位随机}
示例：WUXING-2026-A8K3-N9P2
字符集：A-Z + 2-9（去除易混 0/O/1/I）
长度：建议 20-24 字符
```

**安全要求**：

- 兑换接口必须登录态
- 限频：单用户每分钟最多 5 次失败
- 日志：每次兑换记录 IP、device
- 防爬：兑换码批量生成时校验唯一性

### 5. 会员体系

**三档套餐**：

| ID    | 名称 | 价格 | 时长  | 特性                          |
| ----- | ---- | ---- | ----- | ----------------------------- |
| free  | 听闻 | ¥0   | 永久  | 每日3首试听、30秒预览         |
| month | 月悦 | ¥18  | 30天  | 全部曲目、下载30首            |
| year  | 年藏 | ¥128 | 365天 | 无限下载、专属冥想课、1v1咨询 |

**支付集成**：

- 微信小程序：`wx.requestPayment()`
- 服务端：统一下单 `unifiedorder`
- 支付成功回调更新 `user.membership`

### 6. 离线下载

- 月悦：30 首上限
- 年藏：无限制
- 实现：`wx.downloadFile()` + `wx.saveFile()`
- 注意：小程序本地存储上限 10MB（普通）/ 200MB（saveFile）

------

## API 端点清单

```
认证:
POST   /api/auth/wx-login          # code 换 token
POST   /api/auth/refresh           # 刷新 token

用户:
GET    /api/user/profile
PATCH  /api/user/profile
POST   /api/user/quiz              # 提交测评结果
GET    /api/user/membership

内容:
GET    /api/elements               # 获取五行配置
GET    /api/tracks                 # 曲目列表（按元素筛选）
GET    /api/tracks/:id             # 曲目详情
GET    /api/tracks/recommend       # 个性化推荐
POST   /api/tracks/:id/play        # 播放上报（用于统计 plays）

会员:
GET    /api/plans                  # 套餐列表
POST   /api/pay/create-order       # 创建订单
POST   /api/pay/callback           # 支付回调（微信侧）

兑换码:
POST   /api/cdkey/redeem           # 兑换
GET    /api/cdkey/history          # 兑换历史

统计:
GET    /api/stats/weekly           # 周聆听统计
POST   /api/stats/event            # 行为埋点
```

------

## 状态管理（Zustand 示例）

`src/stores/user.ts`：

```typescript
import { create } from 'zustand';

interface UserStore {
  user: User | null;
  setUser: (u: User) => void;
  updateMembership: (m: Membership) => void;
  logout: () => void;
}

export const useUserStore = create<UserStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  updateMembership: (membership) => set(state => ({
    user: state.user ? { ...state.user, membership } : null
  })),
  logout: () => set({ user: null }),
}));
```

`src/stores/player.ts`：

```typescript
interface PlayerStore {
  currentTrack: Track | null;
  isPlaying: boolean;
  progress: number;
  timerVal: number | null;
  play: (track: Track) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setTimer: (min: number | null) => void;
}
```

------

## 开发优先级

### Phase 1 - MVP（2-3 周）

- [x] 设计稿 / 原型确认
- [ ] 项目脚手架搭建（Taro init）
- [ ] 五行数据 / 测评数据搬入
- [ ] 启动页 / 引导页 / 测评 / 结果页
- [ ] 首页 + 探律 + 个人中心（静态）
- [ ] 音频播放器核心（含 mini player）
- [ ] 微信登录 + 用户中心

### Phase 2 - 会员（1-2 周）

- [ ] 会员页 + 套餐展示
- [ ] 微信支付集成
- [ ] **CDKEY 兑换系统**（前后端）
- [ ] 会员权限校验（试听限制）
- [ ] 后台 CDKEY 管理（生成 / 批量导出 / 禁用）

### Phase 3 - 增强（1-2 周）

- [ ] 离线下载
- [ ] 睡眠统计 / 周报表
- [ ] 后台播放 / 锁屏控制
- [ ] 推送（睡眠提醒）
- [ ] 分享卡片

### Phase 4 - 运营（持续）

- [ ] 曲目库扩充（后台 CMS）
- [ ] 推荐算法优化
- [ ] 数据埋点 / 分析
- [ ] 用户调研 / 迭代

### Phase 5 - App 化（可选，业务跑通后）

- [ ] 补全 `services/*/audio.rn.ts` 实现（react-native-track-player）
- [ ] 补全 `services/*/storage.rn.ts`（AsyncStorage）
- [ ] 补全 `services/*/pay.rn.ts`（iOS IAP / Android H5 支付）
- [ ] 补全所有组件的 `.rn.scss` 样式适配
- [ ] 替换不兼容视觉（gradient / blur 用 RN 库实现）
- [ ] 配置原生工程（iOS Xcode / Android）
- [ ] Apple Developer 账号 + App Store 审核
- [ ] Android 应用市场上架（华为/小米/OPPO/vivo/应用宝）
- [ ] 推送通道接入（极光 / 个推）

------

## 未来扩展到 App（跨端策略）

**目标**：当前以微信小程序为主战场，但代码从第一天起即按跨端友好原则组织，使得未来能以最小成本编译为 iOS / Android 原生 App（基于 Taro 3 + React Native）。

### 总体原则

> 业务逻辑跨端共用，UI 与平台 API 分平台实现。

1. **业务层零依赖平台 API**：组件中禁止直接出现 `wx.xxx` 调用，所有原生能力必须经 service 层封装
2. **样式分平台编写**：差异样式走 `.weapp.scss` / `.rn.scss`，共用样式走 `.scss`
3. **组件库选多端兼容的**：NutUI-React-Taro 优于 vant-weapp
4. **状态管理跨端可用**：Zustand 在 RN 和小程序均可工作

### 平台能力差异速查

| 能力     | 小程序                       | React Native                     | 抽象方案                   |
| -------- | ---------------------------- | -------------------------------- | -------------------------- |
| 音频播放 | `wx.createInnerAudioContext` | `react-native-track-player`      | `services/audio/` 抽象接口 |
| 后台播放 | `BackgroundAudioManager`     | TrackPlayer 内置                 | 同上                       |
| 本地存储 | `wx.setStorageSync`          | `AsyncStorage`                   | `services/storage/`        |
| 文件下载 | `wx.downloadFile`            | `react-native-fs`                | `services/download/`       |
| 支付     | `wx.requestPayment`          | Apple IAP（订阅必须）/ 微信H5SDK | `services/pay/`            |
| 登录     | `wx.login` + code            | 手机号/邮箱/三方 OAuth           | `services/auth/`           |
| 推送     | 订阅消息                     | 极光/个推 / APNs / FCM           | `services/push/`           |
| 分享     | `Button open-type=share`     | `react-native-share`             | `services/share/`          |
| 字体加载 | `wx.loadFontFace`            | 原生工程链接 ttf                 | `services/font/`           |

### 样式兼容性陷阱

RN 用的是 CSS 子集 + Flexbox 布局，**当前原型大量使用的视觉手法在 RN 上不可用**，需要从一开始就避坑：

| 现状（原型）               | RN 兼容性        | 替代方案                                                    |
| -------------------------- | ---------------- | ----------------------------------------------------------- |
| `radial-gradient` 背景渐变 | ❌ 不支持         | `react-native-linear-gradient` 多层叠加 + 透明蒙版          |
| `backdrop-filter: blur()`  | ❌ 不支持         | `@react-native-community/blur`                              |
| `box-shadow`               | ⚠️ 部分支持       | iOS 用 `shadowColor/Offset/Opacity`，Android 用 `elevation` |
| 父元素 color/font 继承     | ❌ 不继承         | 每个 `Text` 单独写样式                                      |
| `@keyframes` CSS 动画      | ❌ 不支持         | `Animated` API 或 `react-native-reanimated`                 |
| `position: fixed`          | ❌ 不支持         | `position: absolute` + 顶层容器                             |
| `pointer-events`           | ⚠️ 仅 `auto/none` | 设计上避免依赖此特性                                        |
| `linear-gradient`          | ⚠️ 需库           | 同 radial-gradient 处理                                     |
| `transform: rotate`        | ✅ 支持           | 不变                                                        |
| Flexbox 基础布局           | ✅ 支持           | 不变                                                        |
| 五行 hex 配色              | ✅ 完全支持       | 不变                                                        |
| 圆角 `border-radius`       | ✅ 支持           | 不变                                                        |
| 透明度 `opacity`           | ✅ 支持           | 不变                                                        |

### 代码组织规范

#### 1. 平台分支文件命名

Taro 编译时会优先匹配带平台后缀的文件：

```
audio.weapp.ts   →  编译微信小程序时使用
audio.rn.ts      →  编译 React Native 时使用
audio.h5.ts      →  编译 H5 时使用
audio.ts         →  兜底文件，未匹配时使用
```

#### 2. Service 层抽象示例

**统一接口**（`services/audio/index.ts`）：

```typescript
export interface AudioService {
  load(url: string): Promise<void>;
  play(): void;
  pause(): void;
  stop(): void;
  seek(sec: number): void;
  onProgress(cb: (current: number, total: number) => void): void;
  onEnd(cb: () => void): void;
  destroy(): void;
}

// Taro 会自动按平台加载对应实现
import audioImpl from './audio';
export default audioImpl as AudioService;
```

**小程序实现**（`services/audio/audio.weapp.ts`）：

```typescript
const ctx = wx.createInnerAudioContext();
export default {
  load: (url) => { ctx.src = url; },
  play: () => ctx.play(),
  pause: () => ctx.pause(),
  // ...
} as AudioService;
```

**RN 实现**（`services/audio/audio.rn.ts`）：

```typescript
import TrackPlayer from 'react-native-track-player';
export default {
  load: async (url) => {
    await TrackPlayer.add({ id: '1', url });
  },
  play: () => TrackPlayer.play(),
  // ...
} as AudioService;
```

#### 3. 样式分平台示例

```
TrackCard/
├── index.tsx              # 业务逻辑
├── index.scss             # 共用样式（基础布局、字体、颜色）
├── index.weapp.scss       # 小程序专属（backdrop-filter / radial-gradient）
└── index.rn.scss          # RN 专属（用 LinearGradient 组件替代）
```

#### 4. 平台判断工具

```typescript
// utils/platform.ts
import Taro from '@tarojs/taro';

export const PLATFORM = process.env.TARO_ENV;
// 'weapp' | 'h5' | 'rn' | 'alipay' | ...

export const isWeapp = PLATFORM === 'weapp';
export const isRN = PLATFORM === 'rn';
export const isH5 = PLATFORM === 'h5';
```

业务代码中需要做平台分支时：

```tsx
{isRN && <BlurView />}
{isWeapp && <View className="backdrop-blur" />}
```

### 支付特别说明 ⚠️

**iOS 端订阅类商品必须走 Apple IAP**（苹果抽 30% 佣金，且禁止引导用户到外部支付），这是 App Store 审核硬规定。具体策略：

- **小程序端**：微信支付，¥18 / ¥128 原价
- **iOS App 端**：苹果内购，价格需上调（如 ¥25 / ¥168 覆盖佣金）
- **Android App 端**：微信支付 H5 / 支付宝 H5，可用原价

CDKEY 兑换路径**完全不受影响**，App 端用户照常使用兑换码升级会员，这也是为什么 CDKEY 系统在 App 化后会变得更重要——可以绕开苹果税做营销活动。

### 字体方案的跨端处理

- **小程序**：`wx.loadFontFace()` 加载 CDN 上的 woff2

- RN

  ：字体文件需要 link 到原生工程

  - iOS：放进 `ios/项目名/Fonts/` 并在 `Info.plist` 注册
  - Android：放进 `android/app/src/main/assets/fonts/`
  - 命令：`npx react-native-asset`

### 推荐策略：分两阶段实施

#### 阶段一：小程序 MVP（当前）

- 严格按上述目录结构组织
- 平台 API 调用走 service 层
- 即使现在只写 `.weapp.ts`，文件名也带后缀
- 样式可暂时只写主样式，标注 `// TODO: RN 不支持` 的属性

#### 阶段二：扩展 App（业务跑通后）

1. 验证用户增长曲线，确认 App 化 ROI
2. 补全所有 service 的 `.rn.ts` 实现
3. 补全样式的 `.rn.scss` 文件
4. 配置原生工程（iOS Xcode / Android Studio）
5. 申请 Apple Developer 账号（$99/年）+ App Store 上架审核
6. Android 上架国内应用市场（华为 / 小米 / OPPO / vivo / 应用宝）

### Claude Code 协作时的额外注意

跨端友好的代码习惯，需要 Claude Code 在写代码时严格遵守：

✅ **必做**：

- 任何 `wx.xxx` API 调用必须包在 `services/` 下
- 新组件中使用的 CSS 属性，要在上面那张兼容性表里核对
- 涉及音频、存储、支付、登录、推送时，永远引用 service 层抽象接口
- 文件命名带 `.weapp` / `.rn` 后缀，即使当前只实现一端

❌ **禁止**：

- 组件 `.tsx` 文件中出现 `wx.xxx`
- 样式中使用 `backdrop-filter` / `radial-gradient` 而不分平台
- 引入小程序专属组件库（如 vant-weapp）
- 业务逻辑里使用 `process.env.TARO_ENV === 'weapp'` 写硬分支（应该用 service 抽象掉）

------

⚠️ **重要**：

- 小程序需要主体备案（个人或公司）
- **音乐版权**：每首曲目需要授权或自制，建议初期与原创音乐人合作（成本低、版权清晰）
- **中医宣称**：UI 上的"疗愈""安神"等需注意《广告法》，避免出现"治疗""治愈"字样
- **服务条款**：需明确标注「本应用提供的音乐为放松辅助，不替代医疗诊断」

------

## 测试 CDKEY（开发期）

```
WUXING-2026-FREE-30D  → 月悦体验卡 30天
MOON-LIGHT-VIP-365    → 年藏会员卡 365天
ZEROER-GIFT-7DAY      → 7日体验卡
```

------

## Claude Code 协作约定

### 代码风格

- TS strict mode 开启
- 函数式组件 + Hooks，不用 class
- 文件命名：组件 PascalCase，工具 camelCase
- 注释用中文，变量名用英文
- 避免巨型组件，单文件超 300 行需拆分

### 提交规范（Conventional Commits）

```
feat: 新功能
fix:  修复
style: 样式
refactor: 重构
docs: 文档
chore: 杂项
```

### 与 Claude Code 协作时

- 优先告知具体页面 / 组件路径
- 提供原型参考：`prototype/wuxing-music-app.jsx`
- 五行配置统一从 `src/constants/wuxing.ts` 引用，不要硬编码
- 颜色、间距走 design tokens，避免魔法数字
- 新增 API 调用前先确认 `src/services/api.ts` 是否已封装

### 已知陷阱

1. 小程序 `style` 不支持所有 CSS 属性，`backdrop-filter`、`radial-gradient` 兼容性需验证
2. `wx.createInnerAudioContext` 在 iOS 弱网下首次加载会很慢，需要 loading 态
3. 真机调试音频问题居多，模拟器不可信
4. 自定义 tabBar 时，要在 `app.config.ts` 设置 `custom: true`
5. 字体加载是异步的，splash 页需要等字体 ready 或预降级
6. **跨端兼容**：写代码时严格遵循「未来扩展到 App」章节的规范，避免后期重构成本

------

## 参考资源

- Taro 官方文档：https://docs.taro.zone/
- 微信小程序文档：https://developers.weixin.qq.com/miniprogram/dev/framework/
- 中医五行音乐疗法相关文献（自行查找）
- 原型预览文件：`prototype/wuxing-music-app.jsx`（React Web 版）

------

**最后更新**：项目初始化 **当前阶段**：原型完成，待 Taro 项目初始化
