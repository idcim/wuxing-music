import { View, Text, ScrollView } from '@tarojs/components';
import { usePlayerStore } from '@/stores/player';
import { useUserStore } from '@/stores/user';
import { WUXING } from '@/constants/wuxing';
import Icon from '@/components/Icon';
import type { ElementId } from '@/types';
import './index.scss';

interface Props {
  open: boolean;
  onClose: () => void;
}

const MODE_LABEL: Record<string, string> = {
  order: '顺序播放',
  shuffle: '随机播放',
  pulse: '悦动模式'
};

const MODE_ICON: Record<string, string> = {
  order: 'repeat',
  shuffle: 'shuffle',
  pulse: 'heart'
};

export default function Playlist({ open, onClose }: Props) {
  const queue = usePlayerStore((s) => s.queue);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playMode = usePlayerStore((s) => s.playMode);
  const playAt = usePlayerStore((s) => s.playAt);
  const cyclePlayMode = usePlayerStore((s) => s.cyclePlayMode);
  const element = useUserStore((s) => s.element) || ('木' as ElementId);
  const el = WUXING[element];

  if (!open) return null;

  return (
    <View className="playlist-mask" onClick={onClose}>
      <View className="playlist" onClick={(e) => e.stopPropagation()}>
        <View className="playlist__handle" />

        <View className="playlist__head">
          <Text className="playlist__title serif">播放列表</Text>
          <View className="playlist__mode" onClick={cyclePlayMode}>
            <Icon name={MODE_ICON[playMode] as any} size={28} color={el.accent} strokeWidth={1.6} />
            <Text className="playlist__mode-text" style={{ color: el.accent }}>
              {MODE_LABEL[playMode]}
            </Text>
          </View>
        </View>

        <Text className="playlist__count">共 {queue.length} 首</Text>

        <ScrollView scrollY className="playlist__scroll">
          {queue.map((t, i) => {
            const active = currentTrack?.id === t.id;
            return (
              <View
                key={`${t.id}-${i}`}
                className="playlist__item"
                onClick={() => playAt(i)}
              >
                <View className="playlist__item-left">
                  {active ? (
                    <Icon
                      name={isPlaying ? 'volume2' : 'pause'}
                      size={28}
                      color={el.primary}
                      strokeWidth={1.6}
                    />
                  ) : (
                    <Text className="playlist__item-idx cormorant">{i + 1}</Text>
                  )}
                </View>
                <View className="playlist__item-info">
                  <Text
                    className="playlist__item-title"
                    style={active ? { color: el.primary } : undefined}
                  >
                    {t.title}
                  </Text>
                  <Text className="playlist__item-sub">{t.hz} · {t.tag}</Text>
                </View>
                <Text className="playlist__item-dur cormorant">{t.duration}</Text>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}
