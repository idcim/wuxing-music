import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { WUXING } from '@/constants/wuxing';
import { useUserStore } from '@/stores/user';
import { isH5 } from '@/utils/platform';
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

// 页面栈里的 route 形如 `pages/home/index`（无前导斜杠），配置里带斜杠，统一后再比
const normalize = (p = '') => p.replace(/^\/+/, '').replace(/\/+$/, '');

export default function TabBar({ active }: Props) {
  const element = useUserStore((s) => s.element) || ('木' as ElementId);
  const el = WUXING[element];

  const go = (tab: (typeof TABS)[number]) => {
    if (tab.key === active) return;

    // 小程序：沿用原生 tabBar 语义——切 tab 不留历史。
    if (!isH5) {
      Taro.redirectTo({ url: tab.path });
      return;
    }

    // H5：hash 路由下 redirectTo 等同 history.replaceState，切 tab 不产生历史条目，
    // 用户「归处→探律→会员」后按微信/浏览器后退键会直接退出整个站点，而不是回到上一页。
    // 因此改为保留历史；目标 tab 已在栈里就回退到它，避免来回切把页面栈撑爆。
    const pages = Taro.getCurrentPages();
    const idx = pages.findIndex((p) => normalize(p.route) === normalize(tab.path));
    if (idx >= 0) {
      Taro.navigateBack({ delta: pages.length - 1 - idx });
      return;
    }
    // 栈快满了就退回 replace，别撞上 10 层上限
    if (pages.length >= 9) {
      Taro.redirectTo({ url: tab.path });
      return;
    }
    Taro.navigateTo({ url: tab.path });
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
