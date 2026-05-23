import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import { PLANS } from '@/constants/plans';
import MiniPlayer from '@/components/MiniPlayer';
import CdkeyModal from '@/components/CdkeyModal';
import TabBar from '@/components/TabBar';
import './index.scss';

export default function Member() {
  const [cdkeyOpen, setCdkeyOpen] = useState(false);
  return (
    <View className="member">
      <Text className="member__title serif">会员</Text>
      <Text className="member__sub">解锁全部音律 · 深度安眠</Text>
      <View className="member__list">
        {PLANS.map((p) => (
          <View
            key={p.id}
            className={`member__plan ${p.featured ? 'member__plan--featured' : ''} fade-up`}
          >
            <View className="member__plan-head">
              <Text className="member__plan-name serif">{p.name}</Text>
              {p.badge && <Text className="member__plan-badge">{p.badge}</Text>}
            </View>
            <View className="member__plan-price">
              <Text className="member__plan-amount">¥{p.price}</Text>
              {p.unit && <Text className="member__plan-unit">{p.unit}</Text>}
            </View>
            {p.features.map((f) => (
              <Text key={f} className="member__plan-feat">· {f}</Text>
            ))}
          </View>
        ))}
      </View>

      <View className="member__cdkey-entry" onClick={() => setCdkeyOpen(true)}>
        <Text className="member__cdkey-entry-text">有兑换码？立即兑换 ›</Text>
      </View>

      <CdkeyModal open={cdkeyOpen} onClose={() => setCdkeyOpen(false)} />
      <MiniPlayer />
      <TabBar active="member" />
    </View>
  );
}
