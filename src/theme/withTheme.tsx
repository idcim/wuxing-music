import type { ComponentType } from 'react';
import { PageMeta } from '@tarojs/components';
import { useSiteStore } from '@/stores/site';
import { isH5 } from '@/utils/platform';
import { THEMES, themeStyle } from './index';

/** 所有页面统一继承风格；新增页面导出时也用此包装，并开启 enablePageMeta。 */
export function withTheme<P extends object>(Page: ComponentType<P>): ComponentType<P> {
  return function ThemedPage(props: P) {
    const theme = useSiteStore(s => s.site.theme_id);
    return <>
      {!isH5 && <PageMeta pageStyle={themeStyle(theme)} backgroundColor={THEMES[theme].bg} />}
      <Page {...props} />
    </>;
  };
}
