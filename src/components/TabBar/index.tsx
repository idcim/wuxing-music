import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { WUXING } from '@/constants/wuxing';
import { useUserStore } from '@/stores/user';
import Icon from '@/components/Icon';
import type { ElementId } from '@/types';
import type { IconName } from '@/components/Icon/paths';
import './index.scss';

export type TabKey = 'home' | 'explore' | 'member' | 'profile';

const TABS: { key: TabKey; text: string; path: string; icon: IconName }[] = [
  { key: 'home', text: '归处', path: '/pages/home/index', icon: 'home' },
  { key: 'explore', text: '探律', path: '/pages/explore/index', icon: 'compass' },
  { key: 'member', text: '会员', path: '/pages/member/index', icon: 'crown' },
  { key: 'profile', text: '我', path: '/pages/profile/index', icon: 'user' }
];

interface Props {
  active: TabKey;
}

export default function TabBar({ active }: Props) {
  const element = useUserStore((s) => s.element) || ('木' as ElementId);
  const el = WUXING[element];

  const go = (tab: (typeof TABS)[number]) => {
    if (tab.key === active) return;
    Taro.redirectTo({ url: tab.path });
  };

  return (
    <View className="tabbar">
      {TABS.map((tab) => {
        const on = active === tab.key;
        return (
          <View key={tab.key} className="tabbar__item" onClick={() => go(tab)}>
            {on && (
              <View className="tabbar__indicator" style={{ background: el.primary }} />
            )}
            <Icon
              name={tab.icon}
              size={36}
              color={on ? el.primary : '#334155'}
              strokeWidth={1.5}
            />
            <Text className="tabbar__text" style={{ color: on ? el.accent : '#475569' }}>
              {tab.text}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
