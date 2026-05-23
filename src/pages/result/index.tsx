import { View, Text } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { WUXING } from '@/constants/wuxing';
import { useUserStore } from '@/stores/user';
import type { ElementId } from '@/types';
import './index.scss';

export default function Result() {
  const router = useRouter();
  const storeEl = useUserStore((s) => s.element);
  const queryEl = router.params.element
    ? (decodeURIComponent(router.params.element) as ElementId)
    : null;
  const id = (queryEl || storeEl || '木') as ElementId;
  const el = WUXING[id];

  const enter = () => Taro.reLaunch({ url: '/pages/home/index' });

  return (
    <View className="result" style={{ background: el.bg }}>
      <View className="result__body fade-up">
        <Text className="result__label">您的本命五行</Text>
        <Text className="result__el serif" style={{ color: el.primary }}>{el.id}</Text>
        <Text className="result__note">{el.note}音 · {el.notePinyin} · {el.organ}</Text>
        <Text className="result__desc">{el.desc}</Text>
        <Text className="result__tip">{el.sleepTip}</Text>
      </View>
      <View className="result__btn" style={{ background: el.primary }} onClick={enter}>
        <Text className="result__btn-text">进入归处</Text>
      </View>
    </View>
  );
}
