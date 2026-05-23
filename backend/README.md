# 五行律音 · 管理后端 (FastAPI)

为小程序与管理后台提供 API。开发期数据库用 SQLite，生产可切 MySQL（改 `DATABASE_URL`）。

## 运行

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate            # Windows
# source .venv/bin/activate        # macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

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
