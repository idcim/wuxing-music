import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import './index.scss';

const TABS = [
  { path: '/pages/home/index', text: '归处' },
  { path: '/pages/explore/index', text: '探律' },
  { path: '/pages/member/index', text: '会员' },
  { path: '/pages/profile/index', text: '我的' }
];

export default function CustomTabBar() {
  const [current, setCurrent] = useState(0);

  const switchTab = (index: number, path: string) => {
    setCurrent(index);
    Taro.switchTab({ url: path });
  };

  return (
    <View className="tabbar">
      {TABS.map((tab, i) => (
        <View
          key={tab.path}
          className="tabbar__item"
          onClick={() => switchTab(i, tab.path)}
        >
          <Text className={`tabbar__text ${current === i ? 'tabbar__text--active' : ''}`}>
            {tab.text}
          </Text>
        </View>
      ))}
    </View>
  );
}
