import { View, Text } from '@tarojs/components';
import { ELEMENT_LIST } from '@/constants/wuxing';
import './index.scss';

export default function Explore() {
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
          >
            <Text className="explore__card-el serif" style={{ color: el.primary }}>{el.id}</Text>
            <Text className="explore__card-note">{el.note}音 · {el.organ}</Text>
            <Text className="explore__card-desc">{el.desc}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
