import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { PLANS } from '@/constants/plans';
import { purchasePlan } from '@/services/pay';
import { useUserStore } from '@/stores/user';
import MiniPlayer from '@/components/MiniPlayer';
import CdkeyModal from '@/components/CdkeyModal';
import TabBar from '@/components/TabBar';
import type { PlanId } from '@/types';
import './index.scss';

export default function Member() {
  const [cdkeyOpen, setCdkeyOpen] = useState(false);
  const [buying, setBuying] = useState<PlanId | null>(null);
  const isPremium = useUserStore((s) => s.isPremium);
  const currentType = useUserStore((s) => s.user?.membership.type);
  const updateMembership = useUserStore((s) => s.updateMembership);

  const buy = async (planId: PlanId) => {
    if (planId === 'free' || buying) return;
    setBuying(planId);
    const res = await purchasePlan(planId);
    setBuying(null);

    if (res.ok) {
      updateMembership(res.membership);
      Taro.showToast({ title: '开通成功', icon: 'success' });
    } else if (res.reason === 'cancel') {
      // 用户主动取消，不提示
    } else if (res.reason === 'platform') {
      Taro.showModal({
        title: '请前往小程序开通',
        content: 'iOS App 端订阅需通过 Apple 内购，或使用兑换码升级',
        showCancel: false
      });
    } else {
      Taro.showToast({ title: '支付失败，请重试', icon: 'none' });
    }
  };

  const btnLabel = (planId: PlanId) => {
    if (planId === 'free') return '免费方案';
    if (buying === planId) return '处理中…';
    if (isPremium && currentType === planId) return '当前方案';
    return '立即开通';
  };

  return (
    <View className="member">
      <Text className="member__title serif">会员</Text>
      <Text className="member__sub">解锁全部音律 · 深度安眠</Text>
      <View className="member__list">
        {PLANS.map((p) => {
          const isCurrent = isPremium && currentType === p.id;
          return (
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
                {p.original && <Text className="member__plan-original">¥{p.original}</Text>}
              </View>
              {p.features.map((f) => (
                <Text key={f} className="member__plan-feat">· {f}</Text>
              ))}
              <View
                className={`member__plan-btn
                  ${p.id === 'free' ? 'member__plan-btn--free' : ''}
                  ${p.featured ? 'member__plan-btn--featured' : ''}
                  ${isCurrent ? 'member__plan-btn--current' : ''}`}
                onClick={() => buy(p.id)}
              >
                <Text className="member__plan-btn-text">{btnLabel(p.id)}</Text>
              </View>
            </View>
          );
        })}
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
