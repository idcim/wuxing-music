import { useState } from 'react';
import { View, Text, ScrollView, Button } from '@tarojs/components';
import Taro, { useShareAppMessage, useShareTimeline, useDidShow } from '@tarojs/taro';
import { openShareMenu } from '@/utils/share';
import { WUXING, ELEMENT_LIST } from '@/constants/wuxing';
import { useUserStore } from '@/stores/user';
import { usePlayerStore } from '@/stores/player';
import Icon from '@/components/Icon';
import { A } from '@/utils/color';
import { getNavTop } from '@/utils/nav';
import TrackCard from '@/components/TrackCard';
import MiniPlayer from '@/components/MiniPlayer';
import TabBar from '@/components/TabBar';
import CdkeyModal from '@/components/CdkeyModal';
import type { ElementId } from '@/types';
import type { IconName } from '@/components/Icon/paths';
import './index.scss';

const TIMER_OPTS = [15, 30, 45, 60];

export default function Home() {
  const element = useUserStore((s) => s.element) || ('木' as ElementId);
  const isPremium = useUserStore((s) => s.isPremium);
  const user = useUserStore((s) => s.user);
  const el = WUXING[element];

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playWithQueue = usePlayerStore((s) => s.playWithQueue);
  const pause = usePlayerStore((s) => s.pause);
  const resume = usePlayerStore((s) => s.resume);
  const timerVal = usePlayerStore((s) => s.timerVal);
  const setTimer = usePlayerStore((s) => s.setTimer);

  const [cdkeyOpen, setCdkeyOpen] = useState(false);

  // 转发好友 + 朋友圈（hook 必须直接写在页面里，Taro 才能编译期识别）
  useDidShow(() => openShareMenu());
  useShareAppMessage(() => ({
    title: `我的本命是${el.id}型·${el.note}音，来五行律音找你的助眠音律`,
    path: '/pages/home/index'
  }));
  useShareTimeline(() => ({
    title: '五行律音 · 按体质定制的助眠音律',
    query: ''
  }));

  const onTrack = (id: number) => {
    const track = el.tracks.find((t) => t.id === id)!;
    if (currentTrack?.id === id) {
      isPlaying ? pause() : resume();
    } else {
      playWithQueue(track, el.tracks);
    }
  };

  const goMember = () => Taro.redirectTo({ url: '/pages/member/index' });
  const goExplore = () => Taro.redirectTo({ url: '/pages/explore/index' });
  const goElement = (id: ElementId) =>
    Taro.navigateTo({ url: `/pages/element/index?id=${id}` });

  // hero 卡 / 推荐曲目（首曲为今晚推荐）
  const hero = el.tracks[0];

  // 会员剩余天数
  const membership = user?.membership;
  const expireDays = membership?.expireAt
    ? Math.max(
        0,
        Math.ceil((new Date(membership.expireAt).getTime() - Date.now()) / 86400000)
      )
    : null;

  return (
    <View className="home" style={{ background: el.bg }}>
      {/* Header（顶部留出胶囊按钮安全高度，避免礼物按钮被遮挡） */}
      <View className="home__header fade-up" style={{ paddingTop: `${getNavTop()}px` }}>
        <View>
          <Text className="home__greeting cormorant italic">Good evening</Text>
          <Text className="home__el">{el.id}型 · {el.note}音</Text>
        </View>
        <View className="home__actions">
          <Button className="home__icon-btn" openType="share">
            <Icon name="share2" size={30} color="#cbd5e1" strokeWidth={1.5} />
          </Button>
          <View className="home__gift" onClick={() => setCdkeyOpen(true)}>
            <Icon name="gift" size={32} color="#cbd5e1" strokeWidth={1.5} />
          </View>
        </View>
      </View>

      {/* 会员状态条 */}
      {isPremium && membership && membership.type !== 'free' && (
        <View
          className="home__member fade-up"
          style={{
            background: `linear-gradient(135deg, ${A.a15(el.primary)}, transparent)`,
            borderColor: A.a25(el.primary)
          }}
        >
          <Icon name="crown" size={32} color={el.accent} strokeWidth={1.5} />
          <View className="home__member-info">
            <Text className="home__member-name">{membership.name}</Text>
            {expireDays !== null && (
              <Text className="home__member-days">剩余 {expireDays} 天</Text>
            )}
          </View>
          <Text className="home__member-active cormorant" style={{ color: el.accent }}>
            ACTIVE
          </Text>
        </View>
      )}

      {/* 今晚推荐 hero 卡 */}
      <View
        className="home__hero fade-up"
        style={{
          animationDelay: '0.1s',
          background: `linear-gradient(135deg, ${A.a15(el.primary)}, rgba(255,255,255,0.02))`,
          borderColor: A.a30(el.primary)
        }}
      >
        <View
          className="home__hero-glow"
          style={{ background: `radial-gradient(circle, ${el.glow}, transparent 70%)` }}
        />
        <View
          className="home__hero-stamp rotate-slow"
          style={{ borderColor: A.a30(el.primary) }}
        >
          <Icon name={el.icon as IconName} size={56} color={el.primary} strokeWidth={1} />
        </View>
        <View className="home__hero-body">
          <Text className="home__hero-eyebrow cormorant italic" style={{ color: el.accent }}>
            TONIGHT FOR YOU
          </Text>
          <Text className="home__hero-title">{hero.title}</Text>
          <Text className="home__hero-meta">
            {el.note}调 · {hero.hz} · {hero.duration}
          </Text>
          <View className="home__hero-actions">
            <View
              className="home__hero-play"
              style={{ background: el.primary }}
              onClick={() => onTrack(hero.id)}
            >
              <Icon name="play" size={24} fill="#0a0e1a" strokeWidth={0} color="#0a0e1a" />
              <Text className="home__hero-play-text">立即聆听</Text>
            </View>
            <Text
              className="home__hero-tag"
              style={{ background: A.a15(el.primary), color: el.accent }}
            >
              {hero.tag}
            </Text>
          </View>
        </View>
      </View>

      {/* 五行分类 */}
      <View className="home__section-head">
        <Text className="home__section-en cormorant italic">Five Elements</Text>
        <Text className="home__section-zh cormorant">五音律</Text>
      </View>
      <ScrollView scrollX className="home__elements" showScrollbar={false}>
        {ELEMENT_LIST.map((w) => {
          const active = w.id === el.id;
          return (
            <View
              key={w.id}
              className="home__el-chip"
              style={{
                background: active ? A.a15(w.primary) : 'rgba(255,255,255,0.025)',
                borderColor: active ? A.a40(w.primary) : 'rgba(255,255,255,0.06)'
              }}
              onClick={() => goElement(w.id)}
            >
              <Icon
                name={w.icon as IconName}
                size={40}
                color={active ? w.primary : '#64748b'}
                strokeWidth={1.5}
              />
              <Text
                className="home__el-chip-id"
                style={{ color: active ? w.primary : '#94a3b8' }}
              >
                {w.id}
              </Text>
              <Text className="home__el-chip-note cormorant">{w.note}</Text>
            </View>
          );
        })}
      </ScrollView>

      {/* 专属曲目 */}
      <View className="home__section-head">
        <Text className="home__section-en cormorant italic">For Your Constitution</Text>
        <View className="home__more" onClick={goExplore}>
          <Text className="home__more-text" style={{ color: el.accent }}>更多</Text>
          <Icon name="chevronRight" size={24} color={el.accent} strokeWidth={1.5} />
        </View>
      </View>
      <View className="home__list">
        {el.tracks.map((t, i) => {
          const locked = !isPremium && t.isPremium;
          return (
            <TrackCard
              key={t.id}
              track={t}
              element={el}
              isActive={currentTrack?.id === t.id}
              isPlaying={isPlaying}
              locked={locked}
              delay={i * 0.08}
              onPlay={() => (locked ? goMember() : onTrack(t.id))}
            />
          );
        })}
      </View>

      {/* 睡眠定时器 */}
      <View className="home__timer">
        <View className="home__timer-head">
          <Icon name="timer" size={28} color="#475569" strokeWidth={1.5} />
          <Text className="home__section-en cormorant italic">Sleep Timer</Text>
        </View>
        <View className="home__timer-grid">
          {TIMER_OPTS.map((m) => {
            const on = timerVal === m;
            return (
              <View
                key={m}
                className="home__timer-btn"
                style={{
                  background: on ? A.a20(el.primary) : 'rgba(255,255,255,0.025)',
                  borderColor: on ? A.a50(el.primary) : 'rgba(255,255,255,0.06)',
                  color: on ? el.primary : '#64748b'
                }}
                onClick={() => setTimer(on ? null : m)}
              >
                <Text className="home__timer-num" style={{ color: on ? el.primary : '#64748b' }}>
                  {m}
                </Text>
                <Text className="home__timer-unit" style={{ color: on ? el.primary : '#64748b' }}>
                  min
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <CdkeyModal open={cdkeyOpen} onClose={() => setCdkeyOpen(false)} />
      <MiniPlayer />
      <TabBar active="home" />
    </View>
  );
}
