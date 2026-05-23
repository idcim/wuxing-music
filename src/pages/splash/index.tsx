import { useMemo } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import Icon from '@/components/Icon';
import { useUserStore } from '@/stores/user';
import './index.scss';

// 预生成星点（固定，避免重渲染抖动）
function makeStars(n: number) {
  return Array.from({ length: n }).map(() => ({
    size: Math.random() * 1.5 + 0.5,
    top: Math.random() * 100,
    left: Math.random() * 100,
    dur: Math.random() * 3 + 2,
    delay: Math.random() * 3
  }));
}

export default function Splash() {
  const stars = useMemo(() => makeStars(50), []);

  useDidShow(() => {
    const { element } = useUserStore.getState();
    const next = element ? '/pages/home/index' : '/pages/onboard/index';
    setTimeout(() => Taro.reLaunch({ url: next }), 2200);
  });

  return (
    <View className="splash">
      {stars.map((s, i) => (
        <View
          key={i}
          className="splash__star"
          style={{
            width: `${s.size * 2}rpx`,
            height: `${s.size * 2}rpx`,
            top: `${s.top}%`,
            left: `${s.left}%`,
            animationDuration: `${s.dur}s`,
            animationDelay: `${s.delay}s`
          }}
        />
      ))}

      <View className="splash__moon float">
        <View className="splash__moon-halo" />
        <Icon name="moon" size={96} color="#cbd5e1" strokeWidth={1} />
      </View>

      <Text className="splash__en cormorant fade-up" style={{ animationDelay: '0.2s' }}>
        WUXING SOUND
      </Text>
      <Text className="splash__title fade-up" style={{ animationDelay: '0.4s' }}>
        五行律音
      </Text>
      <Text className="splash__slogan cormorant italic fade-up" style={{ animationDelay: '0.6s' }}>
        SOUND HEALS · MUSIC RESTORES
      </Text>

      <View className="splash__loader">
        <View className="splash__loader-bar" />
      </View>
    </View>
  );
}
