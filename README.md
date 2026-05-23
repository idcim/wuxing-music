# 五行律音 · 安神助眠音乐小程序

基于中医五行学说的会员制助眠音乐小程序。通过 4 题体质测评为用户匹配专属音律方案，结合古传五音疗愈（角徵宫商羽）与现代频率疗法（174/396/528/741Hz 等），提供个性化安神、助眠、冥想音乐。

> 详细产品/设计/数据规范见 [CLAUDE.md](CLAUDE.md)。

---

## 仓库结构

```
wuxing-music/
├── src/                 # 小程序前端（Taro 4 + React 18 + TS）
│   ├── pages/           #   8 页：splash/onboard/quiz/result/home/explore/member/profile/element/player
│   ├── components/      #   TrackCard / MiniPlayer / CdkeyModal / SleepTimer / TabBar
│   ├── stores/          #   zustand：user / player / content
│   ├── services/        #   api / auth / pay / cdkey / audio(分端) / storage
│   ├── constants/       #   五行配置 / 测评题库 / 套餐 / env(USE_MOCK 开关)
│   └── ...
├── backend/             # 管理后端（FastAPI + SQLAlchemy + 外部 MySQL，Docker 部署）
├── admin/               # 管理后台（Vue3 + Vite + Element Plus）
├── prototype/           # 原型参考（React Web 版）
└── CLAUDE.md            # 项目规范与协作约定
```

---

## 小程序前端

技术栈：Taro 4.2 + React 18 + TypeScript + Sass + Zustand。

```bash
npm install
npm run dev:weapp        # 微信小程序（产物在 dist/，用微信开发者工具打开）
npm run dev:h5           # H5 预览
npm run type-check       # 类型检查
```

**Mock 模式**：后端就绪前，`src/constants/env.ts` 的 `USE_MOCK=true` 让登录 / 支付 / 兑换 / 音频全链路本地跑通。后端上线后置 `false` 并填 `API_BASE` 即切真实接口。

### 已实现

- 启动页 / 引导页 / 五行测评（4 题算分）/ 测评结果
- 首页（本命曲目）/ 探律（五行卡 → 元素详情下钻）/ 会员 / 我的
- 音频播放：`BackgroundAudioManager` 后台/锁屏播放、loading 态、30 秒试听限制
- 迷你播放器 + 全屏播放器（旋转罗盘、进度拖动 seek）
- 睡眠定时器（15/30/45/60 分钟）
- 微信登录、微信支付开通会员、CDKEY 兑换（均含 mock）

### 已知约束

- 自定义 tabBar 在 Taro4+vite 下不编译（官方 bug #18415），改用页内 `TabBar` 组件 + `redirectTo`。
- 音频 `audioUrl` 当前为占位，真机需在微信后台配 `downloadFile` 合法域名；mock 下回退测试音频。

---

## 一键启动（后端 + 后台，Docker）

根目录 `docker-compose.yml` 同时构建并启动 **后端 API** 与 **管理后台**，连接外部 MySQL。

```bash
cp backend/.env.example backend/.env   # 填外部 MySQL 连接串、JWT 密钥、管理员密码
docker compose up -d --build
```

- **管理后台**：http://localhost:8080 （Nginx 托管，`/api` 已反代到后端，同源无跨域）
- **后端 API 文档**：http://localhost:8000/docs ｜ 健康检查：`/api/health`
- 默认管理员：`admin` / `admin123`（由 `backend/.env` 覆盖）
- 后端启动自动建表 + 种子数据（五行/曲目/套餐/测评/测试兑换码）
- 前提：外部 MySQL 已建好库（utf8mb4），账号允许从容器登录

查看日志 `docker compose logs -f`；停止 `docker compose down`。

---

## 管理后端

技术栈：FastAPI + SQLAlchemy + 外部 MySQL（开发可切 SQLite）。详见 [backend/README.md](backend/README.md)。
本地非 Docker 调试见 backend/README。

### 已实现接口（管理端，需 Bearer token）

登录鉴权、仪表盘统计、用户列表、套餐 / 五行 / 歌曲 / 测评题 CRUD、CDKEY 批量生成与禁用、支付参数设置。

---

## 管理后台

技术栈：Vue3 + Vite + Element Plus + Pinia。详见 [admin/README.md](admin/README.md)。
生产用上面的一键启动；本地热更新开发：

```bash
cd admin && npm install && npm run dev   # http://localhost:5173（/api 代理到后端 8000）
```

页面：登录、仪表盘、歌曲管理（分页/筛选/音频封面上传）、五行、套餐、兑换码（批量生成/导出/禁用）、测评、订单（详情+退单）、用户（详情+开通会员）、站点设置（站点信息/小程序/文件存储/支付，含 LOGO/证书上传）。

---

## 路线图

- [x] 小程序前端主流程 + 播放体验（已按原型还原 UI）
- [x] FastAPI 管理后端 + 全套管理 CRUD + Docker（外部 MySQL）
- [x] 管理后台界面（Vue3 + Element Plus）
- [x] 小程序公开接口对接（`USE_MOCK=false` 真连后端）
- [x] 订单管理 + 退单流程；后台开通会员；用户/订单详情
- [x] 站点/小程序/存储/支付配置；文件上传（本地）
- [ ] 微信支付统一下单 + 回调验签（证书已可在后台配置）
- [ ] 微信 code→openid 服务端换取（AppSecret 已可配）
- [ ] OSS 上传逻辑接入（配置已就绪）
- [ ] 周聆听统计 / 分享卡片

> 注：项目不支持「离线下载」，相关功能已全端移除。

---

## 常见问题

- **小程序报 `taro.useState/useMemo is not a function`**：多为增量构建缓存损坏。清缓存后全量重建：
  `rm -rf dist node_modules/.vite .swc && npm run dev:weapp`。
- **`webapi_getwxaasyncsecinfo:fail`**：开发者工具游客模式下 `wx.login` 受限，已自动兜底游客身份；用真实 AppID 登录即正常。
- **图标不显示 / `appServiceSDKScriptError`**：图标用 `View + background-image(URL编码SVG)` 渲染（`<Image>` 不稳）。
- **本地连后端**：开发者工具「本地设置」勾选「不校验合法域名」；真机需把 `API_BASE` 改成局域网 IP。

## 备案与合规

- 小程序需主体备案；音乐版权需授权或自制。
- UI 文案避免「治疗/治愈」等违反《广告法》的医疗宣称，标注「音乐为放松辅助，不替代医疗诊断」。
