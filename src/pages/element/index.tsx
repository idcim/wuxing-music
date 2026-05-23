import { View, Text } from '@tarojs/components';
import Taro, { useRouter, useShareAppMessage, useShareTimeline, useDidShow } from '@tarojs/taro';
import { WUXING } from '@/constants/wuxing';
import { useUserStore } from '@/stores/user';
import { usePlayerStore } from '@/stores/player';
import { openShareMenu } from '@/utils/share';
import TrackCard from '@/components/TrackCard';
import MiniPlayer from '@/components/MiniPlayer';
import type { ElementId } from '@/types';
import './index.scss';

export default function ElementDetail() {
  const router = useRouter();
  const id = (decodeURIComponent(router.params.id || '木') as ElementId);
  const el = WUXING[id];

  const isPremium = useUserStore((s) => s.isPremium);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playWithQueue = usePlayerStore((s) => s.playWithQueue);
  const pause = usePlayerStore((s) => s.pause);
  const resume = usePlayerStore((s) => s.resume);

  useDidShow(() => openShareMenu());
  useShareAppMessage(() => ({
    title: `${el.id}音 · ${el.desc}`,
    path: '/pages/home/index'
  }));
  useShareTimeline(() => ({
    title: '五行律音 · 按体质定制的助眠音律',
    query: ''
  }));

  const back = () => Taro.navigateBack();
  const goMember = () => Taro.redirectTo({ url: '/pages/member/index' });

  const onTrack = (trackId: number) => {
    const track = el.tracks.find((t) => t.id === trackId)!;
    if (currentTrack?.id === trackId) {
      isPlaying ? pause() : resume();
    } else {
      playWithQueue(track, el.tracks);
    }
  };

  return (
    <View className="el-detail" style={{ background: el.bg }}>
      <View className="el-detail__nav">
        <Text className="el-detail__back" onClick={back}>‹</Text>
      </View>

      <View className="el-detail__header fade-up">
        <Text className="el-detail__el serif" style={{ color: el.primary }}>{el.id}</Text>
        <Text className="el-detail__meta">
          {el.note}音 · {el.organ} · {el.season}季 · {el.quality}
        </Text>
        <Text className="el-detail__desc">{el.desc}</Text>
        <Text className="el-detail__tip">{el.sleepTip}</Text>
      </View>

      <View className="el-detail__list">
        {el.tracks.map((t) => {
          const locked = !isPremium && t.isPremium;
          return (
            <TrackCard
              key={t.id}
              track={t}
              element={el}
              isActive={currentTrack?.id === t.id}
              isPlaying={isPlaying}
              locked={locked}
              onPlay={() => (locked ? goMember() : onTrack(t.id))}
            />
          );
        })}
      </View>

      <MiniPlayer />
    </View>
  );
}
