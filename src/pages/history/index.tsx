import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { WUXING } from '@/constants/wuxing';
import { usePlayerStore } from '@/stores/player';
import { request } from '@/services/api';
import TrackCard from '@/components/TrackCard';
import MiniPlayer from '@/components/MiniPlayer';
import { getNavTop } from '@/utils/nav';
import type { Track, ElementId } from '@/types';
import './index.scss';

// 后端聆听历史条目
interface HistoryItem {
  id: number;
  title: string;
  hz: string;
  tag: string;
  duration: string;
  element_id: ElementId;
  played_at: string;
  audioUrl: string;
  coverUrl?: string;
  isPremium: boolean;
  previewSec?: number;
}

// 把历史条目转成 TrackCard 需要的 Track（补齐缺省字段）
function toTrack(it: HistoryItem): Track {
  return {
    id: it.id,
    title: it.title,
    duration: it.duration,
    durationSec: 0,
    hz: it.hz,
    tag: it.tag,
    plays: '',
    audioUrl: it.audioUrl,
    coverUrl: it.coverUrl,
    isPremium: it.isPremium,
    previewSec: it.previewSec
  };
}

// played_at -> 相对时间
function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
  return iso.slice(0, 10);
}

export default function History() {
  const [list, setList] = useState<HistoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const play = usePlayerStore((s) => s.play);
  const pause = usePlayerStore((s) => s.pause);
  const resume = usePlayerStore((s) => s.resume);

  useDidShow(() => {
    request<HistoryItem[]>('/api/mp/history')
      .then((data) => setList(data || []))
      .catch(() => setList([]))
      .finally(() => setLoaded(true));
  });

  const back = () => Taro.navigateBack();

  const onPlay = (it: HistoryItem) => {
    if (currentTrack?.id === it.id) {
      isPlaying ? pause() : resume();
    } else {
      play(toTrack(it));
    }
  };

  return (
    <View className="history">
      <View className="history__nav" style={{ paddingTop: `${getNavTop()}px` }}>
        <Text className="history__back" onClick={back}>‹ 返回</Text>
        <Text className="history__nav-title">聆听历史</Text>
        <View className="history__nav-spacer" />
      </View>

      {loaded && list.length === 0 ? (
        <View className="history__empty">
          <Text className="history__empty-text">还没有聆听记录</Text>
        </View>
      ) : (
        <View className="history__list">
          {list.map((it, i) => {
            const el = WUXING[it.element_id] || WUXING['木'];
            return (
              <View key={`${it.id}-${i}`} className="history__item">
                <TrackCard
                  track={toTrack(it)}
                  element={el}
                  isActive={currentTrack?.id === it.id}
                  isPlaying={isPlaying}
                  onPlay={() => onPlay(it)}
                  delay={Math.min(i * 0.04, 0.4)}
                />
                {!!it.played_at && (
                  <Text className="history__time">{relTime(it.played_at)}</Text>
                )}
              </View>
            );
          })}
        </View>
      )}

      <MiniPlayer />
    </View>
  );
}
