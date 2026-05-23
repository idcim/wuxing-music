import { useState } from 'react';
import { View, Text, Slider } from '@tarojs/components';
import Taro, { useShareAppMessage } from '@tarojs/taro';
import { usePlayerStore } from '@/stores/player';
import { useUserStore } from '@/stores/user';
import { WUXING } from '@/constants/wuxing';
import { fmtTime } from '@/utils/format';
import Icon from '@/components/Icon';
import SleepTimer from '@/components/SleepTimer';
import Playlist from '@/components/Playlist';
import type { ElementId } from '@/types';
import type { IconName } from '@/components/Icon/paths';
import './index.scss';

const MODE_ICON: Record<string, IconName> = {
  order: 'repeat',
  shuffle: 'shuffle',
  pulse: 'heart'
};
const MODE_LABEL: Record<string, string> = {
  order: '顺序',
  shuffle: '随机',
  pulse: '悦动'
};

export default function Player() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isLoading = usePlayerStore((s) => s.isLoading);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const timerVal = usePlayerStore((s) => s.timerVal);
  const playMode = usePlayerStore((s) => s.playMode);
  const queue = usePlayerStore((s) => s.queue);
  const pause = usePlayerStore((s) => s.pause);
  const resume = usePlayerStore((s) => s.resume);
  const seek = usePlayerStore((s) => s.seek);
  const next = usePlayerStore((s) => s.next);
  const prev = usePlayerStore((s) => s.prev);
  const cyclePlayMode = usePlayerStore((s) => s.cyclePlayMode);
  const element = useUserStore((s) => s.element) || ('木' as ElementId);
  const el = WUXING[element];

  const [timerOpen, setTimerOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const hasQueue = queue.length > 1;

  useShareAppMessage(() => ({
    title: currentTrack
      ? `我在听《${currentTrack.title}》· ${el.note}音助眠`
      : '五行律音 · 按体质定制的助眠音律',
    path: '/pages/home/index'
  }));

  const back = () => Taro.navigateBack();

  if (!currentTrack) {
    return (
      <View className="player player--empty" style={{ background: el.bg }}>
        <View className="player__nav">
          <Text className="player__back" onClick={back}>‹</Text>
        </View>
        <Text className="player__empty-text">暂无播放中的曲目</Text>
      </View>
    );
  }

  const dur = currentTrack.durationSec || 1;
  const toggle = () => {
    if (isLoading) return;
    isPlaying ? pause() : resume();
  };
  const onSeek = (e: { detail: { value: number } }) => seek(e.detail.value);

  return (
    <View className="player" style={{ background: el.bg }}>
      <View className="player__nav">
        <Text className="player__back" onClick={back}>‹</Text>
        <Text className="player__nav-title">正在播放</Text>
        <View className="player__nav-spacer" />
      </View>

      <View className="player__disc-wrap">
        <View
          className="player__disc"
          style={{
            borderColor: `${el.primary}40`,
            animationPlayState: isPlaying ? 'running' : 'paused'
          }}
        >
          <View
            className="player__disc-core serif"
            style={{ color: el.primary, background: `radial-gradient(circle, ${el.primary}26, ${el.primary}0d)` }}
          >
            <Text className="player__disc-el">{el.id}</Text>
          </View>
        </View>
      </View>

      <View className="player__meta">
        <Text className="player__title serif">{currentTrack.title}</Text>
        <Text className="player__sub" style={{ color: el.accent }}>
          {currentTrack.hz} · {currentTrack.tag} · {el.note}音
        </Text>
      </View>

      <View className="player__progress">
        <Slider
          className="player__slider"
          min={0}
          max={dur}
          value={Math.min(currentTime, dur)}
          activeColor={el.primary}
          backgroundColor="rgba(255,255,255,0.1)"
          blockSize={16}
          blockColor={el.primary}
          onChange={onSeek}
        />
        <View className="player__time">
          <Text className="player__time-cur serif">{fmtTime(currentTime)}</Text>
          <Text className="player__time-dur serif">{currentTrack.duration}</Text>
        </View>
      </View>

      {/* 顶部小工具：播放模式 / 睡眠定时 / 播放列表 */}
      <View className="player__tools">
        <View className="player__tool" onClick={cyclePlayMode}>
          <Icon name={MODE_ICON[playMode]} size={30} color={el.accent} strokeWidth={1.6} />
          <Text className="player__tool-text" style={{ color: el.accent }}>
            {MODE_LABEL[playMode]}
          </Text>
        </View>

        <View
          className="player__tool"
          style={timerVal ? { color: el.primary } : undefined}
          onClick={() => setTimerOpen(true)}
        >
          <Icon name="timer" size={30} color={timerVal ? el.primary : '#94a3b8'} strokeWidth={1.6} />
          <Text
            className="player__tool-text"
            style={{ color: timerVal ? el.primary : '#94a3b8' }}
          >
            {timerVal ? `${timerVal}分钟` : '定时'}
          </Text>
        </View>

        <View className="player__tool" onClick={() => setListOpen(true)}>
          <Icon name="listMusic" size={30} color="#94a3b8" strokeWidth={1.6} />
          <Text className="player__tool-text" style={{ color: '#94a3b8' }}>列表</Text>
        </View>
      </View>

      {/* 主控制：上一首 / 播放 / 下一首 */}
      <View className="player__controls">
        <View
          className={`player__skip ${hasQueue ? '' : 'player__skip--off'}`}
          onClick={() => hasQueue && prev()}
        >
          <Icon name="skipBack" size={40} fill="#e2e8f0" color="#e2e8f0" strokeWidth={0} />
        </View>

        <View className="player__play" style={{ background: el.primary }} onClick={toggle}>
          {isLoading ? (
            <View className="player__spinner" />
          ) : (
            <Icon
              name={isPlaying ? 'pause' : 'play'}
              size={48}
              fill="#0a0e1a"
              color="#0a0e1a"
              strokeWidth={0}
            />
          )}
        </View>

        <View
          className={`player__skip ${hasQueue ? '' : 'player__skip--off'}`}
          onClick={() => hasQueue && next()}
        >
          <Icon name="skipForward" size={40} fill="#e2e8f0" color="#e2e8f0" strokeWidth={0} />
        </View>
      </View>

      <SleepTimer open={timerOpen} onClose={() => setTimerOpen(false)} />
      <Playlist open={listOpen} onClose={() => setListOpen(false)} />
    </View>
  );
}
