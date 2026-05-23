import { View, Text } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useUserStore } from '@/stores/user';
import './index.scss';

export default function Splash() {
  useDidShow(() => {
    const { element } = useUserStore.getState();
    const next = element ? '/pages/home/index' : '/pages/onboard/index';
    setTimeout(() => {
      Taro.reLaunch({ url: next });
    }, 2000);
  });

  return (
    <View className="splash">
      <View className="splash__compass fade-up" />
      <Text className="splash__title serif">五行律音</Text>
      <Text className="splash__sub">安神 · 助眠 · 五音疗愈</Text>
    </View>
  );
}
