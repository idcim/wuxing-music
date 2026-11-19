# 全端风格

后台「配置与权限 → 风格管理」发布预设风格。公开的 `/api/site/info` 返回 `theme_id`，小程序和 H5 使用站点缓存先渲染，再读取当前配置。回到前台时会刷新。后台站点名称等信息仍由「站点设置」独立管理。

目前支持 `starlight`（原星夜）和 `chinese_classic`（中国古风）。预设配色集中在 `src/theme/index.ts`；后台只保存预设 ID，不接收任意 CSS。新增预设时同步更新后端 `ThemeSettingIn` 的可选值、公开接口白名单和后台预览。

新增小程序页面应在 `index.config.ts` 开启 `enablePageMeta: true`，并用 `withTheme(Page)` 导出页面。`withTheme` 为小程序页面根节点设置风格变量；H5 由站点 store 设置根元素变量。页面 SCSS 使用 `src/styles/variables.scss` 的 `$bg-deep`、`$bg-mid`、`$text-primary`、`$text-secondary`、`$border`、`$surface` 和 `$theme-accent` 等语义变量，避免把当前预设的色值直接写入页面。五行自身的木火土金水标识色仍为内容数据，不随站点风格改变。

风格是已发布小程序包内的预设样式。后台切换已有预设无须重发小程序；增加全新预设仍须发新版小程序。
