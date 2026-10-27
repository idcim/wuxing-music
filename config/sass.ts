import type { IPluginContext } from '@tarojs/service';

export default function sassConfig(ctx: IPluginContext) {
  ctx.modifyViteConfig(({ viteConfig }) => {
    viteConfig.css = {
      ...viteConfig.css,
      preprocessorOptions: {
        ...viteConfig.css?.preprocessorOptions,
        scss: {
          ...viteConfig.css?.preprocessorOptions?.scss,
          // 当前 Vite 4 构建仍通过 Sass legacy JS API 调用。
          silenceDeprecations: ['legacy-js-api']
        }
      }
    };
  });
}
