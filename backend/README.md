# 五行律音 · 管理后端 (FastAPI)

为小程序与管理后台提供 API。开发期数据库用 SQLite，生产可切 MySQL（改 `DATABASE_URL`）。

## 部署方式一：Docker（推荐）

```bash
cd backend
cp .env.example .env        # 修改 JWT_SECRET / ADMIN_PASSWORD 等
docker compose up -d --build
```

- 默认用 SQLite，数据持久化到命名卷 `db_data`（容器内 `/data/wuxing.db`），重建容器数据不丢。
- 健康检查已内置（`/api/health`），`docker compose ps` 可看 healthy 状态。
- 查看日志：`docker compose logs -f api`；停止：`docker compose down`。

### 切换 MySQL（生产）

```bash
# .env 中设置：
# DATABASE_URL=mysql+pymysql://wuxing:wuxingpass@db:3306/wuxing?charset=utf8mb4
# 并取消 docker-compose.yml 里 api 的 depends_on 注释
docker compose --profile mysql up -d --build
```

MySQL 数据持久化到 `mysql_data` 卷。

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
