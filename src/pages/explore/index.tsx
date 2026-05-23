import { useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useShareAppMessage, useShareTimeline, useDidShow } from '@tarojs/taro';
import { ELEMENT_LIST, WUXING } from '@/constants/wuxing';
import { useUserStore } from '@/stores/user';
import { usePlayerStore } from '@/stores/player';
import { openShareMenu } from '@/utils/share';
import Icon from '@/components/Icon';
import { A } from '@/utils/color';
import { getNavTop } from '@/utils/nav';
import TrackCard from '@/components/TrackCard';
import MiniPlayer from '@/components/MiniPlayer';
import TabBar from '@/components/TabBar';
import type { ElementId } from '@/types';
import type { IconName } from '@/components/Icon/paths';
import './index.scss';

export default function Explore() {
  const userElement = useUserStore((s) => s.element);
  // 默认选中用户本命体质（未测评则默认木），切换会更新
  const [selected, setSelected] = useState<ElementId>(
    (userElement as ElementId) || '木'
  );
  const isPremium = useUserStore((s) => s.isPremium);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playWithQueue = usePlayerStore((s) => s.playWithQueue);
  const pause = usePlayerStore((s) => s.pause);
  const resume = usePlayerStore((s) => s.resume);

  const we = WUXING[selected];

  useDidShow(() => openShareMenu());
  useShareAppMessage(() => ({
    title: `${we.id}音 · ${we.desc}，来五行律音听听`,
    path: '/pages/home/index'
  }));
  useShareTimeline(() => ({
    title: '五行律音 · 按体质定制的助眠音律',
    query: ''
  }));

  const goMember = () => Taro.redirectTo({ url: '/pages/member/index' });

  const onTrack = (id: number) => {
    const track = we.tracks.find((t) => t.id === id)!;
    if (currentTrack?.id === id) {
      isPlaying ? pause() : resume();
    } else {
      // 以当前元素曲目列表作为播放队列
      playWithQueue(track, we.tracks);
    }
  };

  return (
    <View className="explore" style={{ background: we.bg }}>
      {/* 标题 */}
      <View className="explore__header fade-up" style={{ paddingTop: `${getNavTop()}px` }}>
        <Text className="explore__eyebrow cormorant italic">Explore Sounds</Text>
        <Text className="explore__title">探索律音</Text>
      </View>

      {/* 筛选 chip 横滑 */}
      <ScrollView scrollX className="explore__chips" showScrollbar={false}>
        {ELEMENT_LIST.map((w) => {
          const active = selected === w.id;
          return (
            <View
              key={w.id}
              className="explore__chip"
              style={{
                background: active ? A.a20(w.primary) : 'rgba(255,255,255,0.025)',
                borderColor: active ? A.a50(w.primary) : 'rgba(255,255,255,0.06)'
              }}
              onClick={() => setSelected(w.id)}
            >
              <Icon
                name={w.icon as IconName}
                size={28}
                color={active ? w.primary : '#64748b'}
                strokeWidth={1.5}
              />
              <Text
                className="explore__chip-text"
                style={{ color: active ? w.primary : '#64748b' }}
              >
                {w.id}音
              </Text>
            </View>
          );
        })}
      </ScrollView>

      {/* 选中元素信息卡 + 曲目列表（背景跟随选中元素） */}
      <View key={we.id}>
        <View
          className="explore__el fade-up"
          style={{
            background: `linear-gradient(135deg, ${A.a15(we.primary)}, transparent)`,
            borderColor: A.a25(we.primary)
          }}
        >
            <View
              className="explore__el-glow"
              style={{ background: `radial-gradient(circle, ${we.glow}, transparent 70%)` }}
            />
            <View className="explore__el-body">
              <View
                className="explore__el-icon"
                style={{ background: A.a15(we.primary), borderColor: A.a40(we.primary) }}
              >
                <Icon name={we.icon as IconName} size={52} color={we.primary} strokeWidth={1.2} />
              </View>
              <View className="explore__el-text">
                <View className="explore__el-row">
                  <Text className="explore__el-id" style={{ color: we.primary }}>{we.id}</Text>
                  <Text className="explore__el-en cormorant" style={{ color: we.accent }}>
                    {we.en} · {we.notePinyin}
                  </Text>
                </View>
                <Text className="explore__el-meta">
                  {we.note}音 · {we.organ} · {we.season}季 · {we.quality}
                </Text>
                <Text className="explore__el-desc">{we.desc}</Text>
              </View>
            </View>
          </View>

          <View className="explore__list">
            {we.tracks.map((t, i) => {
              const locked = !isPremium && t.isPremium;
              return (
                <TrackCard
                  key={t.id}
                  track={t}
                  element={we}
                  isActive={currentTrack?.id === t.id}
                  isPlaying={isPlaying}
                  locked={locked}
                  delay={i * 0.08}
                  onPlay={() => (locked ? goMember() : onTrack(t.id))}
                />
              );
            })}
          </View>
      </View>

      <MiniPlayer />
      <TabBar active="explore" />
    </View>
  );
}
