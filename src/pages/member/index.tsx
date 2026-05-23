import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { PLANS } from '@/constants/plans';
import { ELEMENT_LIST } from '@/constants/wuxing';
import { purchasePlan, purchaseGift } from '@/services/pay';
import { useUserStore } from '@/stores/user';
import { useShare } from '@/utils/share';
import Icon from '@/components/Icon';
import { getNavTop } from '@/utils/nav';
import MiniPlayer from '@/components/MiniPlayer';
import CdkeyModal from '@/components/CdkeyModal';
import PosterShare from '@/components/PosterShare';
import TabBar from '@/components/TabBar';
import type { PlanId } from '@/types';
import type { IconName } from '@/components/Icon/paths';
import './index.scss';

export default function Member() {
  const [cdkeyOpen, setCdkeyOpen] = useState(false);
  const [buying, setBuying] = useState<PlanId | null>(null);
  const [gifting, setGifting] = useState<PlanId | null>(null);
  const [posterOpen, setPosterOpen] = useState(false);
  const [posterTitle, setPosterTitle] = useState('');
  const [posterSub, setPosterSub] = useState('我已开通会员，邀你一起听助眠音律');
  const [giftCode, setGiftCode] = useState('');
  const isPremium = useUserStore((s) => s.isPremium);
  const currentType = useUserStore((s) => s.user?.membership.type);
  const element = useUserStore((s) => s.element);
  const updateMembership = useUserStore((s) => s.updateMembership);

  useShare(() => ({
    title: '五行律音会员 · 解锁全部助眠音律',
    path: '/pages/member/index'
  }));

  const buy = async (planId: PlanId) => {
    if (planId === 'free' || buying) return;
    setBuying(planId);
    const res = await purchasePlan(planId);
    setBuying(null);

    if (res.ok) {
      updateMembership(res.membership);
      Taro.showToast({ title: '开通成功', icon: 'success' });
      // 开通成功 → 弹海报，鼓励分享给好友
      setGiftCode('');
      setPosterTitle(res.membership.name || '律音会员');
      setPosterSub('我已开通会员，邀你一起听助眠音律');
      setTimeout(() => setPosterOpen(true), 800);
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

  // 买卡送朋友：支付后拿到礼物码，用海报展示分享
  const giftBuy = async (planId: PlanId) => {
    if (planId === 'free' || gifting) return;
    setGifting(planId);
    const res = await purchaseGift(planId);
    setGifting(null);

    if (res.ok) {
      Taro.showToast({ title: '礼物卡已生成', icon: 'success' });
      setGiftCode(res.giftCode);
      setPosterTitle(`${res.planName}礼物卡`);
      setPosterSub('送你一张律音会员礼物卡，扫码兑换');
      setTimeout(() => setPosterOpen(true), 600);
    } else if (res.reason === 'cancel') {
      // 取消，不提示
    } else if (res.reason === 'platform') {
      Taro.showModal({
        title: '请前往小程序购买',
        content: 'iOS App 端需通过 Apple 内购',
        showCancel: false
      });
    } else {
      Taro.showToast({ title: '购买失败，请重试', icon: 'none' });
    }
  };

  const btnLabel = (planId: PlanId) => {
    if (planId === 'free') return '免费方案';
    if (buying === planId) return '处理中…';
    if (isPremium && currentType === planId) return '当前方案';
    return '立即开通';
  };

  const planIcon = (id: PlanId): IconName =>
    id === 'year' ? 'crown' : id === 'month' ? 'star' : 'music2';
  const planIconColor = (id: PlanId) =>
    id === 'year' ? '#fde047' : id === 'month' ? '#cbd5e1' : '#64748b';

  return (
    <View className="member">
      {/* 标题 */}
      <View className="member__header fade-up" style={{ paddingTop: `${getNavTop()}px` }}>
        <Text className="member__eyebrow cormorant italic">Membership</Text>
        <Text className="member__title">律音会员</Text>
        <Text className="member__sub">以音养身，以律养神</Text>
      </View>

      {/* CDKEY 入口 */}
      <View className="member__cdkey fade-up" onClick={() => setCdkeyOpen(true)}>
        <View className="member__cdkey-icon">
          <Icon name="keyRound" size={36} color="#38bdf8" strokeWidth={1.5} />
        </View>
        <View className="member__cdkey-text">
          <Text className="member__cdkey-title">使用兑换码</Text>
          <Text className="member__cdkey-sub">CDKEY / Gift Card · 礼品卡兑换会员</Text>
        </View>
        <Icon name="chevronRight" size={32} color="#475569" strokeWidth={1.5} />
      </View>

      {/* 套餐 */}
      <View className="member__list">
        {PLANS.map((p, idx) => {
          const isCurrent = isPremium && currentType === p.id;
          return (
            <View
              key={p.id}
              className={`member__plan ${p.featured ? 'member__plan--featured' : ''} fade-up`}
              style={{ animationDelay: `${idx * 0.08}s` }}
            >
              {p.featured && <View className="member__plan-glow" />}
              {p.badge && (
                <View className={`member__plan-badge ${p.featured ? 'member__plan-badge--featured' : ''}`}>
                  <Text className="member__plan-badge-text">{p.badge}</Text>
                </View>
              )}

              <View className="member__plan-body">
                <View className="member__plan-head">
                  <Icon
                    name={planIcon(p.id)}
                    size={28}
                    color={planIconColor(p.id)}
                    strokeWidth={1.5}
                  />
                  <Text
                    className="member__plan-name"
                    style={{ color: p.featured ? '#fde047' : '#e2e8f0' }}
                  >
                    {p.name}
                  </Text>
                  <Text className="member__plan-en cormorant italic">{p.en}</Text>
                </View>

                <View className="member__plan-price">
                  {p.price === 0 ? (
                    <Text className="member__plan-free">免费</Text>
                  ) : (
                    <View className="member__plan-price-row">
                      <Text
                        className="member__plan-amount"
                        style={{ color: p.featured ? '#fde047' : '#e2e8f0' }}
                      >
                        ¥{p.price}
                      </Text>
                      {p.unit && <Text className="member__plan-unit">{p.unit}</Text>}
                      {p.original && <Text className="member__plan-original">¥{p.original}</Text>}
                    </View>
                  )}
                </View>

                <View className="member__plan-feats">
                  {p.features.map((f) => (
                    <View key={f} className="member__plan-feat">
                      <Icon
                        name="check"
                        size={26}
                        color={p.featured ? '#fde047' : p.price === 0 ? '#475569' : '#cbd5e1'}
                        strokeWidth={2}
                      />
                      <Text
                        className="member__plan-feat-text"
                        style={{
                          color: p.featured ? '#e2e8f0' : p.price === 0 ? '#64748b' : '#cbd5e1'
                        }}
                      >
                        {f}
                      </Text>
                    </View>
                  ))}
                </View>

                <View
                  className={`member__plan-btn
                    ${p.id === 'free' ? 'member__plan-btn--free' : ''}
                    ${p.featured ? 'member__plan-btn--featured' : ''}
                    ${p.id === 'month' ? 'member__plan-btn--month' : ''}
                    ${isCurrent ? 'member__plan-btn--current' : ''}`}
                  onClick={() => buy(p.id)}
                >
                  <Text className="member__plan-btn-text">{btnLabel(p.id)}</Text>
                </View>

                {p.id !== 'free' && (
                  <View className="member__plan-gift" onClick={() => giftBuy(p.id)}>
                    <Icon name="gift" size={26} color="#94a3b8" strokeWidth={1.5} />
                    <Text className="member__plan-gift-text">
                      {gifting === p.id ? '生成中…' : '买卡送朋友'}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* 五音疗愈说明 */}
      <View className="member__heal">
        <View className="member__heal-head">
          <Icon name="award" size={28} color="#94a3b8" strokeWidth={1.5} />
          <Text className="member__heal-title">五音疗愈体系</Text>
        </View>
        <View className="member__heal-list">
          {ELEMENT_LIST.map((w) => (
            <View key={w.id} className="member__heal-row">
              <Icon name={w.icon as IconName} size={32} color={w.primary} strokeWidth={1.5} />
              <Text className="member__heal-el" style={{ color: w.primary }}>{w.id}音</Text>
              <Text className="member__heal-desc">{w.note} · {w.organ} · {w.desc}</Text>
            </View>
          ))}
        </View>
      </View>

      <CdkeyModal open={cdkeyOpen} onClose={() => setCdkeyOpen(false)} />
      <PosterShare
        open={posterOpen}
        onClose={() => setPosterOpen(false)}
        element={element}
        title={posterTitle}
        subtitle={posterSub}
        cdkey={giftCode || undefined}
        scene={`inv=${useUserStore.getState().user?.id || ''}`}
      />
      <MiniPlayer />
      <TabBar active="member" />
    </View>
  );
}
