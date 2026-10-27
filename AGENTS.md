# AGENTS.md

本文件是编码代理的仓库操作指南。开始改动前先阅读相关模块和现有实现，不要仅凭本文或历史文档假设行为。

## 项目与文档

五行律音是一个包含微信小程序、H5、管理后台和后端 API 的 monorepo。

- 完整产品规范、架构、业务约束和已知陷阱：[CLAUDE.md](CLAUDE.md)
- 本地运行与项目简介：[README.md](README.md)
- 部署、域名和上线检查：[docs/DEPLOY.md](docs/DEPLOY.md)
- 五行内容、文案和合规基准：[docs/WUXING-REFERENCE.md](docs/WUXING-REFERENCE.md)
- 版本路线与安全清单：[docs/ROADMAP.md](docs/ROADMAP.md)
- 小程序发布与真机欠账：[docs/WEAPP-TODO.md](docs/WEAPP-TODO.md)
- 后端运行细节：[backend/README.md](backend/README.md)

`CLAUDE.md` 记录了大量已验证的跨端陷阱。修改音频、输入框、导航、海报、支付、登录或代理分成前，先阅读其中对应章节。文档与代码不一致时先核实实际行为，再同步修正文档。

## 目录与技术栈

| 路径 | 职责 | 技术栈 |
| --- | --- | --- |
| `src/` | 微信小程序与 H5 | Taro 4.3、React 18、TypeScript、Sass、Zustand |
| `admin/` | 管理后台 | Vben Admin 5.7 官方核心、Vue 3、Vite、TypeScript、Element Plus、Pinia |
| `backend/` | 公开端与管理端 API | FastAPI、SQLAlchemy 2；生产外部 MySQL，开发可用 SQLite |
| `config/` | Taro 编译配置 | Vite、PostCSS |
| `docker/`、`docker-compose.yml` | H5 与全栈容器部署 | Docker、Nginx |
| `scripts/auto-deploy.sh` | 服务器拉取、重建、健康检查与回滚 | Bash、1Panel 计划任务 |

## 本地开发

### 小程序与 H5

在仓库根目录执行：

```bash
npm ci
npm run dev:weapp
npm run dev:h5
```

小程序产物在 `dist/`，用微信开发者工具打开该目录。先复制 `.env.example` 为 `.env.local`，填写 `TARO_APP_ID` 和 `TARO_APP_API_BASE`；`src/constants/env.ts` 的 `USE_MOCK` 控制 mock，H5 始终使用同源 `/api` 反代。

### 管理后台

```bash
cd admin
npm ci
npm run dev
```

开发服务默认在 `http://localhost:5173`，`/api` 代理到本机 8000 端口。

### 后端

后端文档当前指定 Python 3.13。在 `backend/` 下执行：

```bash
python -m venv .venv
source .venv/Scripts/activate  # Windows / Git Bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

macOS/Linux 的虚拟环境激活路径为 `.venv/bin/activate`。配置格式只参考 `backend/.env.example`；真实密钥放在本地或部署环境的 `.env` 中，不读取、打印或提交密钥文件。生产使用外部 MySQL，本地可将 `DATABASE_URL` 配为 SQLite。

## 修改约定

- 遵循附近代码的命名和结构。TypeScript 保持 strict；React 使用函数组件与 Hooks，不新增 class 组件。
- 组件名用 PascalCase，工具和变量用 camelCase；变量使用英文，必要注释使用中文。单文件超过 300 行时考虑按职责拆分。
- 网络请求沿用 `src/services/api.ts` 的统一信封和错误处理。修改已有 service 时，同步维护其 `USE_MOCK` 与真实接口分支。
- 组件 `.tsx` 中不直接调用 `wx.xxx`；平台能力放入 `src/services/`，跨端差异沿用 `.weapp.ts`、`.h5.ts` 等现有分端方式。
- 页面品牌名和副标题从站点 store 获取，不重新硬编码「五行律音」；同步回调和锁屏等非组件场景沿用现有同步接口。海报绘制保持纯函数，品牌行由调用方通过 `PosterData.brand` 传入，不在 `src/services/poster/draw.ts` 中 import store。
- 颜色、圆角和间距优先使用 `src/styles/variables.scss` 的 token，SCSS 通过 `@use ... as *` 引入，不新增 `@import`。行内尺寸不要直接写 `rpx`，使用 `src/utils/unit.ts` 的 `rpx(n)`。`config/sass.ts` 只屏蔽 Vite 4 无法迁移的 `legacy-js-api` 警告，不要扩大屏蔽范围。
- 五行或测评内容变更先更新 `docs/WUXING-REFERENCE.md`，再同步 `src/constants/wuxing.ts` / `src/constants/quiz.ts` 与 `backend/app/seed.py` 中对应种子数据。
- 后台权限点以 `backend/app/permissions.py` 为准；菜单和路由共用 `admin/src/menu.ts`，前端隐藏不能替代后端鉴权。
- 不重新引入已明确移除的离线下载功能。

## 安全与业务红线

- 生产必须 `DEBUG=false` 并使用随机 `JWT_SECRET`。任何「未配置就放行」的开发兜底都必须受 `settings.debug` 控制，生产缺配置时应拒绝而非放行。
- 登录、支付、退款、兑换和提现等逻辑要保留服务端校验、幂等与限流；不能信任前端传入的身份、金额或余额。
- 小程序启动只恢复已有登录态，不得隐式调用 `login()`；`/api/mp/login` 是 get-or-create，打开即调用会污染注册统计。
- 会员售卖 `purchase_enabled` 与商户支付 `enabled` 是独立开关；关闭售卖只阻止新会员/礼物订单，不影响 CDKEY 兑换和已支付订单回调。
- 用户注销默认软删除并匿名化；只有无订单、兑换、分成、代理和合并引用的测试账号才允许后台物理删除。批量清测试号必须走 `POST /api/admin/users/cleanup-test` 的预检+确认流程，不得绕过 `user_delete.py` 直接删 `user` 行。
- 代理分成模块默认整体关闭，接口、记账和界面三层都要遵守开关；计酬最多两级，不递归增加第三级。
- 五行内容只讲传统文化、音乐气质和情绪感受，不宣称诊断或疗效。五脏等对照不得与「改善」「治疗」连用，测评不得询问身体症状；相关页面保留免责声明。
- 不擅自执行提交、推送、部署、数据库迁移或其他影响共享/生产环境的操作。

## 验证

当前仓库没有配置自动化测试套件。按实际改动范围运行检查，并验证受影响的真实流程：

| 改动范围 | 命令 |
| --- | --- |
| 前端公共代码 | `npm run type-check` |
| 微信小程序 | `npm run build:weapp` |
| H5 | `npm run build:h5` |
| 管理后台 | `cd admin && npm run build` |
| 后端语法 | `cd backend && python -m compileall app` |

后端行为改动还应启动服务并请求受影响接口；无法提供数据库、密钥或外部服务时，明确报告未验证部分。编译和接口 smoke test 不能替代小程序真机、微信 OAuth、JSAPI 支付、音频后台播放等真实环境验证。不要声称未运行的检查已经通过，也不要把「构建成功」写成「全链路已验证」。

纯文档改动无需运行无关构建。

## 部署、版本与提交

- 推送 `master` 会触发服务器自动拉取并重建后端、后台和 H5，等同上线；提交前必须确认改动可直接进入生产。
- 小程序不随服务器自动部署，仍需 `build:weapp`、微信开发者工具上传、提审和发布；相关欠账同步维护 `docs/WEAPP-TODO.md`。
- 正式发版时同步更新 `version.json`、`package.json`、`src/constants/version.ts`、`backend/app/version.py` 和 `docs/ROADMAP.md`。纯文档修正不 bump 版本。
- 提交信息沿用 Conventional Commits：`feat:`、`fix:`、`style:`、`refactor:`、`docs:`、`chore:`。
