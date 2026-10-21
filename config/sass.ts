import type { IPluginContext } from '@tarojs/service';

export default function sassConfig(ctx: IPluginContext) {
  ctx.modifyViteConfig(({ viteConfig }) => {
    viteConfig.css = {
      ...viteConfig.css,
      preprocessorOptions: {
        ...viteConfig.css?.preprocessorOptions,
        scss: {
          ...viteConfig.css?.preprocessorOptions?.scss,
          // Taro 4.2 限定 Vite 4，其 Sass 调用固定为 legacy JS API。
          silenceDeprecations: ['legacy-js-api']
        }
      }
    };
  });
}
