import { useEffect, useRef, useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import ScrollArea from './ScrollArea';
import { usePlayerStore } from '@/stores/player';
import { useUserStore } from '@/stores/user';
import { useContentStore } from '@/stores/content';
import Icon from '@/components/Icon';
import type { ElementId, Track } from '@/types';
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

type ListTab = 'queue' | 'all';

export default function Playlist({ open, onClose }: Props) {
  const queue = usePlayerStore((s) => s.queue);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playMode = usePlayerStore((s) => s.playMode);
  const playAt = usePlayerStore((s) => s.playAt);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const addAllToQueue = usePlayerStore((s) => s.addAllToQueue);
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue);
  const cyclePlayMode = usePlayerStore((s) => s.cyclePlayMode);
  const userElement = useUserStore((s) => s.element);
  const elements = useContentStore((s) => s.elements);
  const getElementOfTrack = useContentStore((s) => s.getElementOfTrack);
  const el = getElementOfTrack(currentTrack, userElement as ElementId | null);
  const [tab, setTab] = useState<ListTab>('queue');
  const allTracks = elements.flatMap((element) => element.tracks);
  const queuedIds = new Set(queue.map((track) => track.id));
  const remaining = allTracks.filter((track) => !queuedIds.has(track.id)).length;
  const maskTouchPoint = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (open) setTab(queue.length ? 'queue' : 'all');
  }, [open]);

  const addOne = (track: Track) => {
    const added = addToQueue(track);
    Taro.showToast({ title: added ? '已加入播放列表' : '已在播放列表', icon: 'none' });
  };

  const addAll = () => {
    const count = addAllToQueue(allTracks);
    Taro.showToast({ title: count ? `已添加 ${count} 首` : '已全部在播放列表', icon: 'none' });
  };

  if (!open) return null;

  return (
    <View
      className="playlist-mask"
      onTouchStart={(e) => {
        const point = (e as any).touches?.[0] || (e as any).changedTouches?.[0];
        maskTouchPoint.current = point
          ? { x: point.clientX ?? point.x ?? 0, y: point.clientY ?? point.y ?? 0 }
          : null;
      }}
      onTouchEnd={(e) => {
        if (e.target !== e.currentTarget) return;
        const start = maskTouchPoint.current;
        maskTouchPoint.current = null;
        if (!start) return;
        const point = (e as any).changedTouches?.[0] || (e as any).touches?.[0];
        const x = point?.clientX ?? point?.x ?? start.x;
        const y = point?.clientY ?? point?.y ?? start.y;
        if (Math.abs(x - start.x) > 12 || Math.abs(y - start.y) > 12) return;
        onClose();
      }}
    >
      <View className="playlist" onClick={(e) => e.stopPropagation()}>
        <View className="playlist__handle" />

        <View className="playlist__head">
          <Text className="playlist__title serif">播放列表</Text>
          <View className="playlist__head-actions">
            {tab === 'queue' && (
              <View className="playlist__mode" onClick={cyclePlayMode}>
                <Icon name={MODE_ICON[playMode] as any} size={28} color={el.accent} strokeWidth={1.6} />
                <Text className="playlist__mode-text" style={{ color: el.accent }}>
                  {MODE_LABEL[playMode]}
                </Text>
              </View>
            )}
            <View className="playlist__close" onClick={onClose}>
              <Icon name="x" size={30} color="#94a3b8" strokeWidth={1.6} />
            </View>
          </View>
        </View>

        <View className="playlist__tabs">
          <View
            className={`playlist__tab ${tab === 'queue' ? 'playlist__tab--active' : ''}`}
            onClick={() => setTab('queue')}
          >
            <Text className="playlist__tab-text">当前列表 · {queue.length}</Text>
          </View>
          <View
            className={`playlist__tab ${tab === 'all' ? 'playlist__tab--active' : ''}`}
            onClick={() => setTab('all')}
          >
            <Text className="playlist__tab-text">全部歌曲 · {allTracks.length}</Text>
          </View>
        </View>

        {tab === 'all' && (
          <View className="playlist__actions">
            <Text className="playlist__remaining">待添加 {remaining} 首</Text>
            <View
              className={`playlist__add-all ${remaining === 0 ? 'playlist__add-all--disabled' : ''}`}
              onClick={() => remaining > 0 && addAll()}
            >
              <Text className="playlist__add-all-text">{remaining > 0 ? '全部添加' : '已全部加入'}</Text>
            </View>
          </View>
        )}

        <ScrollArea className="playlist__scroll">
          {tab === 'queue' && queue.length === 0 && (
            <View className="playlist__empty">
              <Text className="playlist__empty-text">当前列表还没有歌曲</Text>
              <View className="playlist__empty-btn" onClick={() => setTab('all')}>
                <Text className="playlist__empty-btn-text">去添加歌曲</Text>
              </View>
            </View>
          )}

          {tab === 'queue' && queue.map((t, i) => {
            const active = currentTrack?.id === t.id;
            return (
              <View key={`${t.id}-${i}`} className="playlist__item" onClick={() => playAt(i)}>
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
                  <Text className="playlist__item-title" style={active ? { color: el.primary } : undefined}>
                    {t.title}
                  </Text>
                  <Text className="playlist__item-sub">{t.hz} · {t.tag}</Text>
                </View>
                <Text className="playlist__item-dur cormorant">{t.duration}</Text>
                <View
                  className="playlist__item-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFromQueue(i);
                  }}
                >
                  <Icon name="x" size={28} color="#64748b" strokeWidth={1.6} />
                </View>
              </View>
            );
          })}

          {tab === 'all' && allTracks.map((t, i) => {
            const active = currentTrack?.id === t.id;
            const added = queuedIds.has(t.id);
            return (
              <View key={t.id} className="playlist__item" onClick={() => addOne(t)}>
                <View className="playlist__item-left">
                  <Text className="playlist__item-idx cormorant">{i + 1}</Text>
                </View>
                <View className="playlist__item-info">
                  <Text className="playlist__item-title" style={active ? { color: el.primary } : undefined}>
                    {t.title}
                  </Text>
                  <Text className="playlist__item-sub">{t.hz} · {t.tag}</Text>
                </View>
                <Text className="playlist__item-dur cormorant">{t.duration}</Text>
                <View className="playlist__item-add">
                  {added ? (
                    <Icon name="check" size={28} color={el.primary} strokeWidth={1.8} />
                  ) : (
                    <Text className="playlist__item-add-text">+</Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollArea>
      </View>
    </View>
  );
}
