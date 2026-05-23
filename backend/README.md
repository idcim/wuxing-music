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

- compose 已配 `extra_hosts: host.docker.internal:host-gateway`，让容器能访问宿主机 MySQL。
- 连接池启用 `pool_pre_ping` + `pool_recycle=3600`，避免外部库空闲断连。
- 健康检查已内置（`/api/health`）；日志 `docker compose logs -f api`；停止 `docker compose down`。

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
