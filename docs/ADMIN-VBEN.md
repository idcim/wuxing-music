# 管理后台业务页与 Vben

## 来源与边界

使用 Vue Vben Admin 官方 v5.7.0（MIT），来源与重建方式见 [vendor/README.md](../admin/vendor/README.md)。
本次覆盖 `admin/src/views/` 的 24 个视图：16 个业务路由、设置中心内的 7 个面板和登录页。

- `BusinessPage` 使用官方 Page，统一标题、说明、内容区间距；列表页默认包含原生 Vben Card。
- `BusinessCard` 使用官方 shadcn Card。仪表盘、音频历史等自行组织卡片的页面设置 `:card="false"`。
- `BusinessModal` / `BusinessDrawer` 使用官方 `useVbenModal` / `useVbenDrawer`，兼容业务页的 `v-model` 和 footer 插槽。弹窗采用视口内滚动及固定操作栏。
- 表格、表单、分页使用 `BusinessTable` / `BusinessForm` / `BusinessPagination`，底层是 Element Plus。表格事件、选择和排序、表单验证继续使用原有接口。
- 输入、选择、上传、标签、确认框等沿用 Element Plus；`styles/business.css` 将颜色、边框和背景映射到 Vben 主题，页面不各自覆盖深浅色。

业务脚本、请求参数、服务端权限和校验保持原样。没有引入上游示例登录或示例业务接口。

## 后续页面约定

新增业务路由使用 `BusinessPage`，新增业务弹窗和抽屉使用统一组件。表单默认顶部标签；提示文字使用主题变量。
宽表允许在表格内部横向滚动；桌面固定操作列使用不透明背景，小屏取消固定以留出内容空间。
修改 `vendor/` 之前先判断是否可以在业务适配层完成，避免增加上游升级成本。

## 本地验收

构建命令：`cd admin && npm run build`（包含 vue-tsc）。
浏览器验收采用仅监听 localhost 的独立临时 SQLite/样例接口，不接共享数据库：

- 各业务菜单和设置分组可渲染，列表、空态、统计卡片及分页布局正常。
- 曲目编辑的 Vben 弹窗可打开、选择五行、取消并重新打开；用户重复账号抽屉可关闭。
- 深浅色下检查表格、表单、状态文字、弹窗、通知与设置面板。
- 390px 小屏检查筛选栏、表格内部滚动及长表单操作栏，页面无横向溢出。

这些检查验证前端布局与交互，不代表真实微信登录、支付、退款、OSS 上传和生产业务数据已完成端到端验收。
