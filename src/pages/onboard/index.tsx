import { withTheme } from '@/theme/withTheme';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import Icon from '@/components/Icon';
import { ELEMENT_LIST } from '@/constants/wuxing';
import { A } from '@/utils/color';
import { navTopStyle } from '@/utils/nav';
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

// 节点使用容器百分比定位，让短屏上的罗盘缩小后仍保持五音布局。
const NODES = ELEMENT_LIST.map((el, i) => {
  const angle = ((i * 72 - 90) * Math.PI) / 180;
  const x = Math.cos(angle) * 37 + 50;
  const y = Math.sin(angle) * 37 + 50;
  return { el, x, y };
});

function Onboard() {
  const stars = STARS;
  const nodes = NODES;

  const startQuiz = () => Taro.navigateTo({ url: '/pages/quiz/index' });
  const skip = () => Taro.reLaunch({ url: '/pages/home/index' });

  return (
    <View className="onboard" style={navTopStyle()}>
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
        {/* 原为 BASED ON TRADITIONAL CHINESE MEDICINE / 「中医体质测评」，
            是医疗宣称口吻；按 docs/WUXING-REFERENCE.md 改成文化象征口径 */}
        <Text className="onboard__tagline cormorant italic">
          THE FIVE TONES OF EASTERN TRADITION
        </Text>
        <Text className="onboard__title">探寻你的五行音律</Text>
        <Text className="onboard__desc">
          循角徵宫商羽的东方声音传统{'\n'}测出你的音律偏向，匹配今晚适合的声音
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
              left: `${x}%`,
              top: `${y}%`,
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

      <View className="onboard__actions fade-up" style={{ animationDelay: '0.5s' }}>
        <View className="onboard__btn" onClick={startQuiz}>
          <Text className="onboard__btn-text">开始测评</Text>
          <Icon name="arrowRight" size={28} color="#0a0e1a" />
        </View>
        <Text className="onboard__skip" onClick={skip}>跳过，直接体验</Text>
      </View>
    </View>
  );
}

export default withTheme(Onboard);
