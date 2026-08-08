import { useState } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro, { useShareAppMessage, useShareTimeline, useDidShow } from '@tarojs/taro';
import { goBack } from '@/utils/nav';
import { openShareMenu, setH5Share } from '@/utils/share';
import { usePlayerStore } from '@/stores/player';
import { useUserStore } from '@/stores/user';
import { useContentStore } from '@/stores/content';
import { fmtTime } from '@/utils/format';
import { resolveUrl } from '@/utils/url';
import Icon from '@/components/Icon';
import SeekBar from '@/components/SeekBar';
import SleepTimer from '@/components/SleepTimer';
import Playlist from '@/components/Playlist';
import UpgradePrompt from '@/components/UpgradePrompt';
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
  const storeDuration = usePlayerStore((s) => s.duration);
  const buffered = usePlayerStore((s) => s.buffered);
  const loadError = usePlayerStore((s) => s.loadError);
  const retry = usePlayerStore((s) => s.retry);
  const timerVal = usePlayerStore((s) => s.timerVal);
  const playMode = usePlayerStore((s) => s.playMode);
  const queue = usePlayerStore((s) => s.queue);
  const pause = usePlayerStore((s) => s.pause);
  const resume = usePlayerStore((s) => s.resume);
  const seek = usePlayerStore((s) => s.seek);
  const next = usePlayerStore((s) => s.next);
  const prev = usePlayerStore((s) => s.prev);
  const cyclePlayMode = usePlayerStore((s) => s.cyclePlayMode);
  // 音名/调式/配色跟随「正在听的这首曲」所属元素，不是用户体质——
  // 否则听水的曲子会写着「徵音」、背景还是火的橙色。无曲时才退回体质。
  const userElement = useUserStore((s) => s.element);
  const getElementOfTrack = useContentStore((s) => s.getElementOfTrack);
  const el = getElementOfTrack(currentTrack, userElement as ElementId | null);

  const [timerOpen, setTimerOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  // 拖动进度轴时显示目标时间而不是播放位置，否则手指在动、左侧数字不动
  const [dragSec, setDragSec] = useState<number | null>(null);
  const hasQueue = queue.length > 1;

  useDidShow(() => {
    openShareMenu();
    // H5 的「···」转发文案要靠 JS-SDK 设，useShareAppMessage 在 H5 是空操作
    setH5Share(
      currentTrack
        ? `我在听《${currentTrack.title}》· ${el.note}音助眠`
        : '五行律音 · 按体质定制的助眠音律',
      '循五行五音，为你匹配今晚适合的声音',
      '/pages/home/index'
    );
  });
  useShareAppMessage(() => ({
    title: currentTrack
      ? `我在听《${currentTrack.title}》· ${el.note}音助眠`
      : '五行律音 · 按体质定制的助眠音律',
    path: '/pages/home/index'
  }));
  useShareTimeline(() => ({
    title: '五行律音 · 按体质定制的助眠音律',
    query: ''
  }));

  const back = () => goBack();

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

  // 优先用音频实际时长：从聆听历史进来的曲目 durationSec 是 0，
  // 只靠它 dur 会退化成 1，进度条变成「1 秒的歌」——拖一下就到底，
  // 而右侧时长文字仍显示真实值，两者自相矛盾。
  const dur = Math.round(storeDuration) || currentTrack.durationSec || 1;
  const toggle = () => {
    if (isLoading) return;
    isPlaying ? pause() : resume();
  };

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
            {currentTrack.coverUrl ? (
              <Image className="player__disc-cover" src={resolveUrl(currentTrack.coverUrl)} mode="aspectFill" />
            ) : (
              <Text className="player__disc-el">{el.id}</Text>
            )}
          </View>
        </View>
      </View>

      <View className="player__meta">
        <Text className="player__title serif">{currentTrack.title}</Text>
        {/* hz / tag 后台可以留空（运营自建的曲目常常只填标题和音频），
            直接用 · 串起来会渲染成「· · 角音」，得先滤掉空的 */}
        <Text className="player__sub" style={{ color: el.accent }}>
          {[currentTrack.hz, currentTrack.tag, `${el.note}音`].filter(Boolean).join(' · ')}
        </Text>
        {!!(el.meta?.mode || el.meta?.musicMood) && (
          <Text className="player__mood">
            {[el.meta?.mode, el.meta?.musicMood].filter(Boolean).join(' · ')}
          </Text>
        )}
      </View>

      <View className="player__progress">
        <SeekBar
          duration={dur}
          currentTime={currentTime}
          buffered={buffered}
          color={el.primary}
          onSeek={seek}
          onSeeking={setDragSec}
        />
        {!!loadError && (
          <View className="player__error">
            <Text className="player__error-text">{loadError}</Text>
            <View className="player__error-btn" onClick={retry}>
              <Text className="player__error-btn-text">重试</Text>
            </View>
          </View>
        )}
        <View className="player__time">
          <Text className="player__time-cur serif">
            {fmtTime(dragSec !== null ? dragSec : currentTime)}
          </Text>
          {/* 音频报了真实时长就以它为准，与进度条同源，避免条与文字对不上 */}
          <Text className="player__time-dur serif">
            {storeDuration ? fmtTime(storeDuration) : currentTrack.duration || fmtTime(dur)}
          </Text>
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
      {/* 本页不渲染 MiniPlayer，试听到限的升级引导要自己挂一份 */}
      <UpgradePrompt />
    </View>
  );
}
