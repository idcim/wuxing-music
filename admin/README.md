# 五行律音 · 管理后台 (Vue3 + Element Plus)

管理员 Web 界面，连接 `backend/` 的 FastAPI 接口。

## 运行

```bash
cd admin
npm install
npm run dev          # 开发，默认 http://localhost:5173
```

开发期 Vite 已把 `/api` 代理到 `http://localhost:8000`（后端），无需配跨域。
确保后端已启动（`cd backend && docker compose up -d`）。

默认管理员账号见后端 `.env` 的 `ADMIN_USERNAME` / `ADMIN_PASSWORD`。

## 构建

```bash
npm run build        # 产物在 dist/
```

部署时把 `dist/` 交给 Nginx 等静态服务器托管，并把 `/api` 反代到后端。

## 页面

- 登录
- 仪表盘（统计概览）
- 歌曲管理（分页/按五行筛选/增删改）
- 五行管理（颜色/五音/脏腑等）
- 套餐管理
- 兑换码（批量生成 / 导出 / 禁用 / 筛选）
- 测评管理（题目 + 选项加分）
- 用户（列表/搜索）
- 支付设置（微信支付参数，密钥脱敏）
