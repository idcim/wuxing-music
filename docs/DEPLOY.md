# 部署与配置说明

monorepo：**小程序 / H5 前端（Taro）** + **后端 API（FastAPI）** + **管理后台（Vue3）**。
后端与后台用 Docker 部署（`docker-compose.yml`），连**外部 MySQL**（1Panel 网络内）。

## 架构与端口

| 组件 | 容器 / 产物 | 端口 | 说明 |
|---|---|---|---|
| 后端 API | `wuxing-backend` | 8000 | `/api/mp/*` 小程序/H5 公开端；`/api/admin/*` 管理端 |
| 管理后台 | `wuxing-admin` | 8080 | Nginx 托管，`/api` 反代到后端 |
| MySQL | 外部（`1panel-network`） | 3306 | 不随容器，单独维护 |
| H5 前端 | `wuxing-h5`（Nginx，含 build:h5） | 8081 | 托管静态产物 + 同源反代 `/api`、`/uploads` 到后端 |
| 小程序 | `dist/`（`npm run build:weapp`） | — | 微信开发者工具上传，不走服务器 |

---

## ⭐ 域名 / URL 配置清单（H5 上线必看）

H5 相关域名散落三处，逐一配好：

### 1) 前端（**改了要重新 build**）
- **`src/constants/env.ts` → `API_BASE`**：**H5 已改为同源相对地址**（`process.env.TARO_ENV === 'h5' ? '' : 绝对地址`），由 H5 容器内 nginx 反代 `/api` 到后端，**H5 无需改、也无需 CORS**。那个绝对地址**仅小程序端用**——上线换成线上后端域名后 `build:weapp`；`USE_MOCK` 保持 `false`。
- **`config/index.ts` → `h5.publicPath`**：H5 静态资源基路径，默认 `/`，子路径部署才改。（`h5.devServer.proxy` 已配好本地 `dev:h5` 的 `/api` 代理，默认指 `127.0.0.1:8000`，按需改。）

### 2) 后端 / 后台（改 `.env` 或后台设置，**无需重新构建前端**）
- **`backend/.env` → `CORS_ORIGINS`**：**H5 已同源反代，无需 CORS**；这里通常只需管理后台域名（若后台与 API 不同源）。例：`["https://admin.your-domain.com"]`。
- **管理后台 → 设置 → 支付设置 → 回调地址**（`pay_config.notify_url`）：填 `https://<后端域名>/api/mp/pay/callback`（公网可达 HTTPS）。⚠️ 后台输入框占位符误写成 `/api/pay/callback`，**实际路由是 `/api/mp/pay/callback`**，以此为准。
- **管理后台 → 设置 → 公众号**（`oa_config`）：公众号 AppID / AppSecret（H5 网页授权 + JS-SDK + JSAPI 支付共用）。

### 3) 微信平台后台（填 H5 域名，不在代码里）
- **公众号后台 → 设置与开发 → 公众号设置 → 功能设置**：
  - **网页授权域名** = H5 域名（OAuth 静默登录回跳）
  - **JS 接口安全域名** = H5 域名（chooseWXPay / 分享）
- **微信支付商户后台 → 产品中心 → 开发配置 → JSAPI 支付授权目录** = H5 支付页所在目录（如 `https://h5.your-domain.com/`）。
- **小程序后台 → 开发管理 → 服务器域名**：request / downloadFile 合法域名 = 后端域名 + 音频 CDN（**仅小程序端需要，H5 不需要**）。

---

## backend/.env 配置

复制 `backend/.env.example` 为 `backend/.env` 填真实值。关键项：

| 项 | 说明 |
|---|---|
| `DEBUG` | **生产必须 `false`**；否则 dev 兜底（短信回明文码/支付免付开通/游客登录）仍开着 |
| `JWT_SECRET` | 随机长串（`openssl rand -hex 32`）；`DEBUG=false` 时若为默认值后端**拒绝启动** |
| `DATABASE_URL` | 外部 MySQL 连接串（1Panel 用 MySQL **容器名**做 host） |
| `CORS_ORIGINS` | 后台 + H5 域名（JSON 数组） |
| `ADMIN_PASSWORD` | 管理后台强密码 |

---

## 首次部署（1Panel + Docker）

```bash
git clone https://github.com/idcim/wuxing-music.git /opt/1panel/www/sites/app/index/wuxing-music
cd /opt/1panel/www/sites/app/index/wuxing-music
cp backend/.env.example backend/.env      # 按上表填真实值
docker compose up -d --build              # 起 后端 + 后台 + H5
docker compose logs -f
```
- 后端 API 文档 `http://<服务器>:8000/docs`，健康检查 `/api/health`
- 管理后台 `http://<服务器>:8080`（`admin` / `.env` 里的密码）
- H5 站点 `http://<服务器>:8081`（微信内打开走公众号登录/支付）
- 前提：外部 MySQL 已建库 `wuxing`（utf8mb4），账号允许从容器登录
- 在 1Panel「网站」给 8000 / 8080 套域名 + HTTPS（反向代理）

---

## 自动部署（1Panel 计划任务）

`scripts/auto-deploy.sh` 是**单次幂等**脚本：检查 git 有更新才 拉取 → 重建 → 健康检查 → 失败回滚；无更新直接退出；带锁防并发。适合被计划任务高频调用。

**1Panel 里配置：**
1. **计划任务 → 创建计划任务**
2. 任务类型：**Shell 脚本**
3. 执行周期：如**每 1 分钟**（无更新几乎零开销）
4. 脚本内容：
   ```bash
   export WUXING_REPO_DIR=/opt/1panel/www/sites/app/index/wuxing-music
   bash /opt/1panel/www/sites/app/index/wuxing-music/scripts/auto-deploy.sh
   ```

之后**只要 `git push` 到 GitHub `master`，1 分钟内服务器自动拉取重建**。
日志在 `/var/log/wuxing-deploy.log`。可覆盖的环境变量（分支 `WUXING_BRANCH`、健康地址 `WUXING_HEALTH_URL`、是否回滚 `WUXING_ROLLBACK` 等）见脚本头部注释。

---

## H5 前端（已容器化）

H5 已作为 `wuxing-h5` 服务并入 `docker-compose.yml`——`docker compose up -d --build`
会自动 `build:h5` 并用 Nginx 托管（:8081），且**同源反代 `/api`、`/uploads` 到后端容器**
（见 `docker/Dockerfile.h5` + `docker/h5.nginx.conf`）。因此 H5 免 CORS、不依赖外部后端域名，
`git push` 后由自动部署脚本一并重建。

在 1Panel「网站」给 `:8081` 绑 H5 域名 + HTTPS（反代），并在公众号后台把该域名配为
网页授权域名 + JS 安全域名。

> 小程序端（`build:weapp`）仍经微信开发者工具上传发布，不走服务器。

---

## 生产上线检查单

- [ ] `backend/.env`：`DEBUG=false`、随机 `JWT_SECRET`、强 `ADMIN_PASSWORD`、真实 `DATABASE_URL`、`CORS_ORIGINS`（后台域名；H5 已同源无需）
- [ ] `src/constants/env.ts`：小程序端 `API_BASE` 指向线上后端（H5 已同源无需改）、`USE_MOCK=false`
- [ ] 后台配置：公众号 AppID/Secret、微信商户号 v3（证书 / APIv3 密钥 / 回调 `/api/mp/pay/callback`）、短信服务商密钥
- [ ] 微信平台：公众号网页授权域名 + JS 安全域名、商户 JSAPI 支付目录、小程序合法域名
- [ ] 备案：H5 与后端域名已备案
- [ ] 其余安全项见 [ROADMAP.md](ROADMAP.md) 「上线前安全加固清单」
```
