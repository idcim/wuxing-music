# 五行律音 · 管理后台 (Vben Admin 5.7 + Element Plus)

管理员 Web 界面，连接 `backend/` 的 FastAPI 接口。

页头提供「使用教程」「版本更新」「关于我们」三个直达入口；窄屏统一收在带文字的「教程与帮助」菜单中。教程按账号权限显示业务入口，涵盖音乐、课程商城、订单、APP 发布和微信登录配置。关于我们读取站点设置的介绍，每次打开重新加载；后台自动检查更新及手动检查入口保留。

使用官方 Vben 5.7.0 的布局、菜单、偏好设置、Page、Card、Modal 与 Drawer。
现有业务页通过 `src/components/business/` 统一接入；表格、表单、分页及输入控件采用 Element Plus 适配 Vben 主题。
组件约定和验收说明见 [`docs/ADMIN-VBEN.md`](../docs/ADMIN-VBEN.md)。
Vben workspace 源码与 MIT 许可证在 `vendor/`，通过 npm workspaces 安装，来源与升级方式见
[`vendor/README.md`](vendor/README.md)。菜单、路由和后端权限点仍遵守本项目的权限及模块开关。

## 运行

```bash
cd admin
npm ci
npm run dev          # 开发，默认 http://localhost:5173
```

开发期 Vite 已把 `/api` 代理到 `http://localhost:8000`（后端），无需配跨域。
确保后端已启动（仓库根目录执行 `docker compose up -d api`，或在 `backend/` 运行本地服务）。
需要接独立测试后端时，可通过环境变量 `ADMIN_API_PROXY_TARGET` 覆盖代理目标。

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
- 音频任务历史（服务器持久保存、分页与结果/批次筛选、失败任务重试）
- 五行管理（颜色/五音/脏腑等）
- 套餐管理
- 兑换码（批量生成 / 导出 / 禁用 / 筛选）
- 测评管理（题目 + 选项加分）
- 用户（列表/搜索）
- 支付设置（微信支付参数，密钥脱敏）
