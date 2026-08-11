import { View, Text } from '@tarojs/components';
import { useRouter, useShareAppMessage, useShareTimeline, useDidShow } from '@tarojs/taro';
import { goBack } from '@/utils/nav';
import { WUXING } from '@/constants/wuxing';
import { useUserStore } from '@/stores/user';
import { usePlayerStore } from '@/stores/player';
import { brandLine } from '@/stores/site';
import { openShareMenu, setH5Share } from '@/utils/share';
import TrackCard from '@/components/TrackCard';
import MiniPlayer from '@/components/MiniPlayer';
import type { ElementId, ElementMeta } from '@/types';
import './index.scss';

// 展示哪些文化维度、按什么顺序。取的是「能听出来/看得见」的那几项，
// 五脏五腑等身体对照不单列，避免读成疗效承诺（docs/WUXING-REFERENCE.md 一）。
const FACTS: [string, keyof ElementMeta][] = [
  ['调式', 'mode'],
  ['五化', 'phase'],
  ['方位', 'direction'],
  ['五色', 'colorName'],
  ['五志', 'emotion'],
  ['五神', 'spirit'],
  ['时间感', 'timeFeel'],
  ['空间感', 'spaceFeel']
];

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

  useDidShow(() => {
    openShareMenu();
    // H5 的「···」转发文案要靠 JS-SDK 设，useShareAppMessage 在 H5 是空操作
    setH5Share(`${el.id}音 · ${el.desc}`, '循五行五音，为你匹配今晚适合的声音', '/pages/explore/index');
  });
  useShareAppMessage(() => ({
    title: `${el.id}音 · ${el.desc}`,
    path: '/pages/home/index'
  }));
  useShareTimeline(() => ({
    title: brandLine(),
    query: ''
  }));

  const back = () => goBack();

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
          {el.note}音 · {el.meta?.notation || el.notePinyin} · {el.season}季 · {el.quality}
        </Text>
        <Text className="el-detail__desc">{el.desc}</Text>
        <Text className="el-detail__tip">{el.sleepTip}</Text>

        {/* 文化对照维度：只做知识展示，不与「改善/治疗」连用（docs/WUXING-REFERENCE.md 一） */}
        <View className="el-detail__facts">
          {FACTS.map(([label, key]) => {
            const v = el.meta?.[key];
            return v ? (
              <View key={key} className="el-detail__fact">
                <Text className="el-detail__fact-k">{label}</Text>
                <Text className="el-detail__fact-v" style={{ color: el.accent }}>{v}</Text>
              </View>
            ) : null;
          })}
        </View>
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
              onPlay={() => onTrack(t.id)}
            />
          );
        })}
      </View>

      <MiniPlayer />
    </View>
  );
}
