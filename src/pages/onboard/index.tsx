import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import Icon from '@/components/Icon';
import { ELEMENT_LIST } from '@/constants/wuxing';
import { A } from '@/utils/color';
import { rpx } from '@/utils/unit';
import type { IconName } from '@/components/Icon/paths';
import './index.scss';

// 模块级常量（一次性计算）。避免组件内 useMemo——小程序端会触发
// Cannot read 'useMemo' of undefined。
const STARS = Array.from({ length: 30 }).map(() => ({
  top: Math.random() * 100,
  left: Math.random() * 100,
  dur: Math.random() * 3 + 2,
  delay: Math.random() * 3
}));

// 罗盘节点位置：半径 95（px）→ rpx，圆心在 240rpx 容器中心
const NODES = ELEMENT_LIST.map((el, i) => {
  const angle = ((i * 72 - 90) * Math.PI) / 180;
  const x = Math.cos(angle) * 190 + 240; // 95*2=190, 圆心 120*2=240
  const y = Math.sin(angle) * 190 + 240;
  return { el, x, y };
});

export default function Onboard() {
  const stars = STARS;
  const nodes = NODES;

  const startQuiz = () => Taro.navigateTo({ url: '/pages/quiz/index' });
  const skip = () => Taro.reLaunch({ url: '/pages/home/index' });

  return (
    <View className="onboard">
      {stars.map((s, i) => (
        <View
          key={i}
          className="onboard__star"
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            animationDuration: `${s.dur}s`,
            animationDelay: `${s.delay}s`
          }}
        />
      ))}

      <View className="onboard__head fade-up" style={{ animationDelay: '0.1s' }}>
        <Text className="onboard__tagline cormorant italic">
          BASED ON TRADITIONAL CHINESE MEDICINE
        </Text>
        <Text className="onboard__title">探寻你的五行音律</Text>
        <Text className="onboard__desc">
          通过中医五行体质测评{'\n'}为你匹配专属的安神助眠音律方案
        </Text>
      </View>

      <View
        className="onboard__compass fade-up"
        style={{ animationDelay: '0.3s' }}
      >
        <View className="onboard__ring onboard__ring--outer" />
        <View className="onboard__ring onboard__ring--inner" />
        {nodes.map(({ el, x, y }) => (
          <View
            key={el.id}
            className="onboard__node"
            style={{
              left: rpx(x - 56),
              top: rpx(y - 56),
              background: `radial-gradient(circle, ${A.a25(el.primary)}, transparent 70%)`,
              borderColor: A.a40(el.primary)
            }}
          >
            <Icon name={el.icon as IconName} size={40} color={el.primary} strokeWidth={1.5} />
          </View>
        ))}
        <View className="onboard__center">
          <Icon name="circleDot" size={40} color="#94a3b8" strokeWidth={1.5} />
        </View>
      </View>

      <View className="onboard__btn fade-up" style={{ animationDelay: '0.5s' }} onClick={startQuiz}>
        <Text className="onboard__btn-text">开始测评</Text>
        <Icon name="arrowRight" size={28} color="#0a0e1a" />
      </View>
      <Text className="onboard__skip" onClick={skip}>跳过，直接体验</Text>
    </View>
  );
}
