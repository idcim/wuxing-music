import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { ELEMENT_LIST } from '@/constants/wuxing';
import MiniPlayer from '@/components/MiniPlayer';
import TabBar from '@/components/TabBar';
import type { ElementId } from '@/types';
import './index.scss';

export default function Explore() {
  const openElement = (id: ElementId) =>
    Taro.navigateTo({ url: `/pages/element/index?id=${encodeURIComponent(id)}` });

  return (
    <View className="explore">
      <Text className="explore__title serif">探律</Text>
      <Text className="explore__sub">五行五音 · 各有所归</Text>
      <View className="explore__grid">
        {ELEMENT_LIST.map((el) => (
          <View
            key={el.id}
            className="explore__card fade-up"
            style={{ borderColor: el.glow }}
            onClick={() => openElement(el.id)}
          >
            <Text className="explore__card-el serif" style={{ color: el.primary }}>{el.id}</Text>
            <Text className="explore__card-note">{el.note}音 · {el.organ}</Text>
            <Text className="explore__card-desc">{el.desc}</Text>
            <Text className="explore__card-arrow">›</Text>
          </View>
        ))}
      </View>
      <MiniPlayer />
      <TabBar active="explore" />
    </View>
  );
}
