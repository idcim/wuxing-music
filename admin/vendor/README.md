# Vben Admin core

本后台使用 [Vue Vben Admin](https://github.com/vbenjs/vue-vben-admin) 官方 **v5.7.0**
（commit `63a38dce49ba109f61607994e21ba921d8e970e9`，MIT）。

引入 `VbenAdminLayout`、官方菜单、偏好设置、设计系统、Page、Card 与 popup-ui；
业务页的表格和输入控件通过统一适配层使用 Element Plus，
鉴权、菜单权限和模块开关接本项目后端。这里保留所需 workspace 包的源码，npm workspaces
本地解析；生产构建不再临时拉取上游仓库，也不引用 npm 上的同名非官方包。

通过 `python scripts/vendor-vben.py <官方 v5.7.0 checkout>` 可重建这些目录。
与上游的适配只有 package.json 的 workspace/catalog 依赖展开、Tailwind 扫描目录、
移除本项目编译器下不适用的 unused `@ts-expect-error`；
`vben-page/` 来自上游 `packages/effects/common-ui/src/components/page/`；业务定制位于 `src/`。许可证见 [LICENSE](LICENSE)。
