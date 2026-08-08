import { View, Text } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/Icon/paths';
import { WUXING, WUXING_DISCLAIMER } from '@/constants/wuxing';
import { useUserStore } from '@/stores/user';
import { A } from '@/utils/color';
import { rpx } from '@/utils/unit';
import type { ElementId, ElementScores } from '@/types';
import './index.scss';

const ALL_ELEMENTS: ElementId[] = ['木', '火', '土', '金', '水'];

export default function Result() {
  const router = useRouter();
  const storeEl = useUserStore((s) => s.element);
  const storeScores = useUserStore((s) => s.scores);
  const isPremium = useUserStore((s) => s.isPremium);
  const queryEl = router.params.element
    ? (decodeURIComponent(router.params.element) as ElementId)
    : null;
  const id = (queryEl || storeEl || '木') as ElementId;
  const el = WUXING[id];

  // 五行分布：按分数降序；无数据时给均匀兜底
  const scores: ElementScores =
    storeScores || ({ 木: 1, 火: 1, 土: 1, 金: 1, 水: 1 } as ElementScores);
  const sorted = ALL_ELEMENTS
    .map((k) => [k, scores[k] ?? 0] as [ElementId, number])
    .sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, v]) => s + v, 0);

  const enter = () => Taro.reLaunch({ url: '/pages/home/index' });
  // 会员页是 tab 页，用 reLaunch 让 TabBar 状态正确（本页不在 tab 栈里）
  const goMember = () => Taro.reLaunch({ url: '/pages/member/index' });

  return (
    <View className="result" style={{ background: el.bg }}>
      {/* 英文小标 */}
      <Text
        className="result__eyebrow cormorant italic fade-up"
        style={{ color: el.accent }}
      >
        YOUR CONSTITUTION
      </Text>

      {/* 体质大圆 */}
      <View
        className="result__orb fade-up"
        style={{
          animationDelay: '0.15s',
          background: `radial-gradient(circle, ${A.a25(el.primary)}, transparent 70%)`,
          border: `${rpx(2)} solid ${A.a40(el.primary)}`
        }}
      >
        <View
          className="result__orb-ring"
          style={{ border: `${rpx(2)} dashed ${A.a20(el.primary)}` }}
        />
        <Icon name={el.icon as IconName} size={112} color={el.primary} strokeWidth={1} />
      </View>

      {/* 元素名 + 副信息 */}
      <View className="result__head fade-up" style={{ animationDelay: '0.3s' }}>
        <Text className="result__name">{el.id}型</Text>
        <Text className="result__sub cormorant" style={{ color: el.accent }}>
          {el.en} · {el.notePinyin}
        </Text>
        <Text className="result__meta">
          {el.note}音 · {el.meta?.notation || el.notePinyin} · {el.season}季
        </Text>
      </View>

      {/* 五行分布卡 */}
      <View className="result__card fade-up" style={{ animationDelay: '0.45s' }}>
        <View className="result__card-head">
          <Text className="result__card-title cormorant italic">Element Distribution</Text>
          <Icon name="barChart3" size={28} color="#475569" strokeWidth={1.5} />
        </View>
        {sorted.map(([k]) => {
          const w = WUXING[k];
          const pct = total ? Math.round(((scores[k] ?? 0) / total) * 100) : 20;
          return (
            <View key={k} className="result__row">
              <Icon name={w.icon as IconName} size={28} color={w.primary} strokeWidth={1.5} />
              <Text className="result__row-name">{k}</Text>
              <View className="result__bar">
                <View
                  className="result__bar-fill"
                  style={{ width: `${pct}%`, background: w.primary }}
                />
              </View>
              <Text className="result__row-pct cormorant" style={{ color: w.primary }}>
                {pct}%
              </Text>
            </View>
          );
        })}
      </View>

      {/* 调理建议卡 */}
      <View
        className="result__heal fade-up"
        style={{
          animationDelay: '0.55s',
          background: `linear-gradient(135deg, ${A.a10(el.primary)}, transparent)`,
          border: `${rpx(2)} solid ${A.a25(el.primary)}`
        }}
      >
        {/* 原文案是「Healing Direction / 调理建议」，医疗宣称口吻，已按
            docs/WUXING-REFERENCE.md 改成「情绪转化方向」——讲的是感受，不是疗效 */}
        <View className="result__heal-head">
          <Icon name="sparkles" size={28} color={el.accent} strokeWidth={1.5} />
          <Text className="result__heal-title cormorant italic" style={{ color: el.accent }}>
            Sound Direction
          </Text>
        </View>
        {!!el.meta?.transform && (
          <Text className="result__heal-tag" style={{ color: el.accent }}>
            {el.meta.transform}
          </Text>
        )}
        <Text className="result__heal-text">{el.sleepTip}</Text>
      </View>

      {/* CTA */}
      <View
        className="result__cta"
        style={{ boxShadow: `0 ${rpx(20)} ${rpx(80)} ${el.glow}` }}
        onClick={enter}
      >
        <Text className="result__cta-text">进入律音馆</Text>
        <Icon name="arrowRight" size={28} color="#0a0e1a" strokeWidth={2} />
      </View>

      {/* 次级入口：刚看到自己的体质与助眠建议，是整个漏斗里意图最强的一刻，
          此前这里只有「进入律音馆」，没有任何会员引导。非会员才显示。 */}
      {!isPremium && (
        <View className="result__upsell" onClick={goMember}>
          <Icon name="crown" size={28} color={el.accent} strokeWidth={1.5} />
          <Text className="result__upsell-text" style={{ color: el.accent }}>
            解锁{el.id}型全部专属音律
          </Text>
          <Icon name="chevronRight" size={26} color={el.accent} strokeWidth={1.5} />
        </View>
      )}

      {/* 合规：凡是展示五行/五脏对照的页面都要能看到这句（docs/WUXING-REFERENCE.md 一） */}
      <Text className="result__disclaimer">{WUXING_DISCLAIMER}</Text>
    </View>
  );
}
