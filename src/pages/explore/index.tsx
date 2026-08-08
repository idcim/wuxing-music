import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useShareAppMessage, useShareTimeline, useDidShow } from '@tarojs/taro';
import { ELEMENT_LIST, WUXING } from '@/constants/wuxing';
import { useUserStore } from '@/stores/user';
import { usePlayerStore } from '@/stores/player';
import { openShareMenu, setH5Share } from '@/utils/share';
import Icon from '@/components/Icon';
import { A } from '@/utils/color';
import { navTopStyle } from '@/utils/nav';
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

  useDidShow(() => {
    openShareMenu();
    // H5 的「···」转发文案要靠 JS-SDK 设，useShareAppMessage 在 H5 是空操作
    setH5Share(`${we.id}音 · ${we.desc}，来五行律音听听`, '循五行五音，为你匹配今晚适合的声音', '/pages/explore/index');
  });
  useShareAppMessage(() => ({
    title: `${we.id}音 · ${we.desc}，来五行律音听听`,
    path: '/pages/home/index'
  }));
  useShareTimeline(() => ({
    title: '五行律音 · 按体质定制的助眠音律',
    query: ''
  }));

  const goTones = () =>
    Taro.navigateTo({ url: `/pages/tones/index?id=${encodeURIComponent(selected)}` });

  // 「疏展、春天、成长、郁结舒开」→ 四个标签
  const keywords = (we.meta?.keywords || '').split('、').map((s) => s.trim()).filter(Boolean);

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
      <View className="explore__header fade-up" style={navTopStyle()}>
        <Text className="explore__eyebrow cormorant italic">Explore Sounds</Text>
        <Text className="explore__title">探索律音</Text>
      </View>

      {/* 五行筛选：一行铺满，不横滑 */}
      <View className="explore__chips">
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
      </View>

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
                  {we.note}音 · {we.meta?.notation || we.notePinyin} · {we.season}季 · {we.quality}
                </Text>
                <Text className="explore__el-desc">{we.desc}</Text>
              </View>
            </View>

            {/* 讲法 + 关键词 + 知识页入口。chips 只切元素、信息卡只有一句 desc 时，
                这套五音体系在探律页基本看不出来。文案见 docs/WUXING-REFERENCE.md */}
            {!!we.sleepTip && <Text className="explore__el-quote serif">{we.sleepTip}</Text>}
            {!!keywords.length && (
              <View className="explore__el-keys">
                {keywords.map((k) => (
                  <Text
                    key={k}
                    className="explore__el-key"
                    style={{ background: A.a10(we.primary), color: we.accent }}
                  >
                    {k}
                  </Text>
                ))}
              </View>
            )}
            <View className="explore__el-more" onClick={goTones}>
              <Text className="explore__el-more-text" style={{ color: we.accent }}>五音对照</Text>
              <Icon name="chevronRight" size={24} color={we.accent} strokeWidth={1.5} />
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
                  onPlay={() => onTrack(t.id)}
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
