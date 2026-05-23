import { useState } from 'react';
import { View, Text, Slider } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { usePlayerStore } from '@/stores/player';
import { useUserStore } from '@/stores/user';
import { WUXING } from '@/constants/wuxing';
import { fmtTime } from '@/utils/format';
import SleepTimer from '@/components/SleepTimer';
import type { ElementId } from '@/types';
import './index.scss';

export default function Player() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isLoading = usePlayerStore((s) => s.isLoading);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const timerVal = usePlayerStore((s) => s.timerVal);
  const pause = usePlayerStore((s) => s.pause);
  const resume = usePlayerStore((s) => s.resume);
  const seek = usePlayerStore((s) => s.seek);
  const element = useUserStore((s) => s.element) || ('木' as ElementId);
  const el = WUXING[element];

  const [timerOpen, setTimerOpen] = useState(false);

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

      <View className="player__controls">
        <View
          className={`player__timer ${timerVal ? 'player__timer--on' : ''}`}
          style={timerVal ? { color: el.primary } : undefined}
          onClick={() => setTimerOpen(true)}
        >
          <Text className="player__timer-text">{timerVal ? `${timerVal}'` : '⏱'}</Text>
        </View>

        <View className="player__play" style={{ background: el.primary }} onClick={toggle}>
          {isLoading ? (
            <View className="player__spinner" />
          ) : (
            <Text className="player__play-icon">{isPlaying ? '‖' : '▶'}</Text>
          )}
        </View>

        <View className="player__timer player__timer--placeholder" />
      </View>

      <SleepTimer open={timerOpen} onClose={() => setTimerOpen(false)} />
    </View>
  );
}
