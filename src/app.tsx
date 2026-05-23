import { PropsWithChildren } from 'react';
import { useLaunch } from '@tarojs/taro';
import './app.scss';

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    console.log('五行律音 App launched.');
  });

  return children;
}

export default App;
