import { PropsWithChildren } from 'react';
import { useLaunch } from '@tarojs/taro';
import { useUserStore } from '@/stores/user';
import './app.scss';

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    useUserStore.getState().initFromCache();
  });

  return children;
}

export default App;
