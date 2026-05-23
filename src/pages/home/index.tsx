import { View, Text } from '@tarojs/components';
import { WUXING } from '@/constants/wuxing';
import { useUserStore } from '@/stores/user';
import { usePlayerStore } from '@/stores/player';
import type { ElementId } from '@/types';
import './index.scss';

export default function Home() {
  const element = useUserStore((s) => s.element) || ('木' as ElementId);
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
          const active = currentTrack?.id === t.id;
          return (
            <View key={t.id} className="track" onClick={() => onTrack(t.id)}>
              <View className="track__dot" style={{ background: el.primary }} />
              <View className="track__info">
                <Text className="track__title">{t.title}</Text>
                <Text className="track__meta">{t.hz} · {t.tag} · {t.duration}</Text>
              </View>
              <Text className="track__state" style={{ color: el.primary }}>
                {active && isPlaying ? '‖' : '▶'}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
