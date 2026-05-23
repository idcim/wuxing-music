import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import './index.scss';

export type TabKey = 'home' | 'explore' | 'member' | 'profile';

const TABS: { key: TabKey; text: string; path: string }[] = [
  { key: 'home', text: '归处', path: '/pages/home/index' },
  { key: 'explore', text: '探律', path: '/pages/explore/index' },
  { key: 'member', text: '会员', path: '/pages/member/index' },
  { key: 'profile', text: '我的', path: '/pages/profile/index' }
];

interface Props {
  active: TabKey;
}

export default function TabBar({ active }: Props) {
  const go = (tab: (typeof TABS)[number]) => {
    if (tab.key === active) return;
    Taro.redirectTo({ url: tab.path });
  };

  return (
    <View className="tabbar">
      {TABS.map((tab) => (
        <View key={tab.key} className="tabbar__item" onClick={() => go(tab)}>
          <Text className={`tabbar__text ${active === tab.key ? 'tabbar__text--active' : ''}`}>
            {tab.text}
          </Text>
        </View>
      ))}
    </View>
  );
}
