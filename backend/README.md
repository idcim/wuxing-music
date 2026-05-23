# 五行律音 · 管理后端 (FastAPI)

为小程序与管理后台提供 API。生产连接**外部 MySQL**（数据库不随容器，单独维护）；本地开发可改回 SQLite。

## 部署方式一：Docker + 外部 MySQL（推荐）

前提：已有一个可访问的 MySQL 实例，并建好库（如 `wuxing`，字符集 `utf8mb4`）。
应用启动时会自动建表 + 写种子数据，无需手动建表。

```bash
cd backend
cp .env.example .env        # 填入 DATABASE_URL（外部 MySQL）、JWT_SECRET、ADMIN_PASSWORD
docker compose up -d --build
```

`.env` 里的连接串示例：

```
# MySQL 与 Docker 同机：
DATABASE_URL=mysql+pymysql://用户名:密码@host.docker.internal:3306/wuxing?charset=utf8mb4
# MySQL 在独立服务器：把 host.docker.internal 换成其 IP/域名
DATABASE_URL=mysql+pymysql://用户名:密码@10.0.0.5:3306/wuxing?charset=utf8mb4
```

- 连接池启用 `pool_pre_ping` + `pool_recycle=3600`，避免外部库空闲断连。
- 健康检查已内置（`/api/health`）；日志 `docker compose logs -f api`；停止 `docker compose down`。

## 部署到 1Panel（MySQL 在 1panel-network 内）

1Panel 的 MySQL 是容器，运行在 `1panel-network` 网络里。根 `docker-compose.yml` 已让
`api` 接入该外部网络，因此**用 MySQL 的容器名直连**（不是 host.docker.internal）。

步骤：
1. 在 1Panel → 容器，查到 MySQL 的**容器名**（如 `1Panel-mysql-xxxx`）。
2. 在 1Panel 的 MySQL 里建库 `wuxing`（utf8mb4），并确保账号允许从网络内主机连接（host `%`）。
3. `backend/.env` 设置（host 用 MySQL 容器名）：
   ```
   DATABASE_URL=mysql+pymysql://用户名:密码@1Panel-mysql-xxxx:3306/wuxing?charset=utf8mb4
   ```
4. 部署：`docker compose up -d --build`。api 会加入 `1panel-network` 并连上 MySQL，
   启动时自动建表 + 种子数据。

排错：
- `Can't connect ... Name or service not known` → 容器名写错，或 api 没进 1panel-network
  （`docker network inspect 1panel-network` 看 api 是否在内）。
- `Access denied` → MySQL 账号 host 不允许（建 `用户@%` 授权）。
- 启动日志若打印「数据库连接失败，请检查 .env」会附脱敏连接串，照它排查。

## 部署方式二：本地 venv（开发）

需 **Python 3.13**（3.14 缺 pydantic-core 预编译 wheel）。

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate            # Windows
# source .venv/bin/activate        # macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## 通用

启动时自动建表 + 写入种子数据（五行/曲目/套餐/测评题/测试兑换码/管理员）。

- API 文档：http://localhost:8000/docs
- 健康检查：http://localhost:8000/api/health
- 默认管理员：`admin` / `admin123`（可由 `.env` 覆盖）

## 配置（.env，可选）

```
DATABASE_URL=sqlite:///./wuxing.db
JWT_SECRET=请改成随机串
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

## 已实现接口（管理端，均需 Bearer token）

| 模块 | 路径 |
|------|------|
| 登录 | `POST /api/admin/login`、`GET /api/admin/me` |
| 仪表盘 | `GET /api/admin/dashboard` |
| 用户 | `GET /api/admin/users` |
| 套餐 | `GET/POST /api/admin/plans`、`DELETE /api/admin/plans/{id}` |
| 五行 | `GET/POST /api/admin/elements`、`DELETE .../{id}` |
| 歌曲 | `GET/POST /api/admin/tracks`、`PUT/DELETE .../{id}` |
| 兑换码 | `GET /api/admin/cdkeys`、`POST .../generate`、`POST .../{id}/disable` |
| 测评 | `GET/POST /api/admin/quiz`、`PUT/DELETE .../{id}` |
| 支付设置 | `GET/PUT /api/admin/settings/pay` |

## 待补（后续轮次）

- 小程序侧公开接口（登录、曲目、兑换、下单、支付回调）
- 微信支付统一下单 / 回调验签
- 订单管理、统计报表、操作日志
