import { PropsWithChildren } from 'react';
import { useLaunch } from '@tarojs/taro';
import { useUserStore } from '@/stores/user';
import { useContentStore } from '@/stores/content';
import './app.scss';

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    useUserStore.getState().initFromCache();
    // 从后端拉取五行/曲目（mock 下用本地常量）
    useContentStore.getState().hydrate();
  });

  return children;
}

export default App;
