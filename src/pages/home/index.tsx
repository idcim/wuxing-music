import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { WUXING } from '@/constants/wuxing';
import { useUserStore } from '@/stores/user';
import { usePlayerStore } from '@/stores/player';
import TrackCard from '@/components/TrackCard';
import MiniPlayer from '@/components/MiniPlayer';
import TabBar from '@/components/TabBar';
import type { ElementId } from '@/types';
import './index.scss';

export default function Home() {
  const element = useUserStore((s) => s.element) || ('木' as ElementId);
  const isPremium = useUserStore((s) => s.isPremium);
  const el = WUXING[element];
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const play = usePlayerStore((s) => s.play);
  const pause = usePlayerStore((s) => s.pause);
  const resume = usePlayerStore((s) => s.resume);

  const onTrack = (id: number) => {
    const track = el.tracks.find((t) => t.id === id)!;
    if (currentTrack?.id === id) {
      isPlaying ? pause() : resume();
    } else {
      play(track);
    }
  };

  const goMember = () => Taro.redirectTo({ url: '/pages/member/index' });

  return (
    <View className="home" style={{ background: el.bg }}>
      <View className="home__header fade-up">
        <Text className="home__greeting">归处</Text>
        <Text className="home__el serif" style={{ color: el.primary }}>
          {el.id}型 · {el.note}音
        </Text>
        <Text className="home__desc">{el.desc}</Text>
      </View>

      <View className="home__list">
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
      <TabBar active="home" />
    </View>
  );
}
