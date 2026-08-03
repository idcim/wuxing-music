import { Fragment, useState } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { usePlayerStore } from '@/stores/player';
import { useUserStore } from '@/stores/user';
import { WUXING } from '@/constants/wuxing';
import { A } from '@/utils/color';
import { rpx } from '@/utils/unit';
import { fmtTime } from '@/utils/format';
import { resolveUrl } from '@/utils/url';
import Icon from '@/components/Icon';
import SleepTimer from '@/components/SleepTimer';
import UpgradePrompt from '@/components/UpgradePrompt';
import type { ElementId } from '@/types';
import type { IconName } from '@/components/Icon/paths';
import './index.scss';

export default function MiniPlayer() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isLoading = usePlayerStore((s) => s.isLoading);
  const progress = usePlayerStore((s) => s.progress);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const buffered = usePlayerStore((s) => s.buffered);
  const loadError = usePlayerStore((s) => s.loadError);
  const retry = usePlayerStore((s) => s.retry);
  const duration = usePlayerStore((s) => s.duration);
  const timerVal = usePlayerStore((s) => s.timerVal);
  const pause = usePlayerStore((s) => s.pause);
  const resume = usePlayerStore((s) => s.resume);
  const element = useUserStore((s) => s.element) || ('木' as ElementId);

  const [timerOpen, setTimerOpen] = useState(false);

  // 升级引导已抽到 UpgradePrompt（全屏播放器页不渲染 MiniPlayer，那边也要能弹）。
  // 无曲目时本组件不出现，但仍要把引导挂上——试听到限那一刻是有曲目的，
  // 这里主要保证「停止播放后清空 currentTrack」不会把待弹的提示一起吞掉。
  if (!currentTrack) return <UpgradePrompt />;

  const el = WUXING[element];
  const toggle = () => {
    // 加载失败时按钮变成「重试」，别让用户对着一个没反应的播放键
    if (loadError) { retry(); return; }
    if (isLoading) return;
    isPlaying ? pause() : resume();
  };

  // 直接用 store 里的真实播放秒数。
  // （旧写法 progress*0.36 / progress*21.6 是把百分比按「36 分钟一首」硬折算的，
  //  凡是时长不等于 36 分钟的曲目，显示的时间都是错的。）
  const curLabel = fmtTime(currentTime);
  const bufferedPct = duration ? Math.min(100, (buffered / duration) * 100) : 0;

  return (
    <Fragment>
    <View
      className="mini-player"
      style={{
        borderColor: A.a40(el.primary),
        boxShadow: `0 ${rpx(-20)} ${rpx(80)} ${el.glow}`
      }}
    >
      <View className="mini-player__body">
        <View
          className="mini-player__cover"
          style={{
            background: `radial-gradient(circle, ${A.a30(el.primary)}, ${A.a10(el.primary)})`,
            borderColor: A.a40(el.primary)
          }}
          onClick={() => Taro.navigateTo({ url: '/pages/player/index' })}
        >
          {currentTrack.coverUrl ? (
            <Image className="mini-player__cover-img" src={resolveUrl(currentTrack.coverUrl)} mode="aspectFill" />
          ) : (
            <Icon name={el.icon as IconName} size={36} color={el.primary} strokeWidth={1.5} />
          )}
        </View>

        <View className="mini-player__info">
          <Text className="mini-player__title">
            {loadError || currentTrack.title}
          </Text>
          <View className="mini-player__row">
            <Text className="mini-player__time cormorant" style={{ color: el.accent }}>
              {curLabel}
            </Text>
            <View className="mini-player__bar">
              <View
                className="mini-player__bar-buffer"
                style={{ width: `${bufferedPct}%` }}
              />
              <View
                className="mini-player__bar-fill"
                style={{ width: `${progress}%`, background: el.primary }}
              />
            </View>
          </View>
        </View>

        <View
          className="mini-player__timer"
          style={timerVal ? { color: el.primary } : undefined}
          onClick={() => setTimerOpen(true)}
        >
          {timerVal ? (
            <Text className="mini-player__timer-text">{timerVal}'</Text>
          ) : (
            <Icon name="timer" size={28} color="#94a3b8" strokeWidth={1.6} />
          )}
        </View>

        <View className="mini-player__wave">
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              className="mini-player__wave-bar"
              style={{
                background: el.primary,
                height: isPlaying ? '100%' : '30%',
                animation: isPlaying
                  ? `wave ${0.5 + i * 0.1}s ease-in-out infinite`
                  : 'none',
                animationDelay: `${i * 0.08}s`
              }}
            />
          ))}
        </View>

        <View className="mini-player__toggle" style={{ background: el.primary }} onClick={toggle}>
          {loadError ? (
            <Icon name="repeat" size={26} color="#0a0e1a" strokeWidth={2} />
          ) : isLoading ? (
            <View className="mini-player__spinner" />
          ) : isPlaying ? (
            <Icon name="pause" size={28} fill="#0a0e1a" strokeWidth={0} color="#0a0e1a" />
          ) : (
            <Icon name="play" size={28} fill="#0a0e1a" strokeWidth={0} color="#0a0e1a" />
          )}
        </View>
      </View>
    </View>

    {/* 抽屉放到 .mini-player(fixed) 之外，否则 fixed 嵌套 fixed 会相对父级定位、被导航栏遮挡 */}
    <SleepTimer open={timerOpen} onClose={() => setTimerOpen(false)} />
    <UpgradePrompt />
    </Fragment>
  );
}
