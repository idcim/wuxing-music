import { useEffect, useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { usePlayerStore } from '@/stores/player';
import { useUserStore } from '@/stores/user';
import { WUXING } from '@/constants/wuxing';
import { A } from '@/utils/color';
import Icon from '@/components/Icon';
import SleepTimer from '@/components/SleepTimer';
import type { ElementId } from '@/types';
import type { IconName } from '@/components/Icon/paths';
import './index.scss';

export default function MiniPlayer() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isLoading = usePlayerStore((s) => s.isLoading);
  const progress = usePlayerStore((s) => s.progress);
  const timerVal = usePlayerStore((s) => s.timerVal);
  const pause = usePlayerStore((s) => s.pause);
  const resume = usePlayerStore((s) => s.resume);
  const showUpgrade = usePlayerStore((s) => s.showUpgrade);
  const dismissUpgrade = usePlayerStore((s) => s.dismissUpgrade);
  const element = useUserStore((s) => s.element) || ('木' as ElementId);

  const [timerOpen, setTimerOpen] = useState(false);

  useEffect(() => {
    if (!showUpgrade) return;
    Taro.showModal({
      title: '试听结束',
      content: '开通会员，畅听全部专属音律',
      confirmText: '去开通',
      cancelText: '再想想',
      success: (res) => {
        if (res.confirm) Taro.redirectTo({ url: '/pages/member/index' });
      },
      complete: () => dismissUpgrade()
    });
  }, [showUpgrade, dismissUpgrade]);

  if (!currentTrack) return null;

  const el = WUXING[element];
  const toggle = () => {
    if (isLoading) return;
    isPlaying ? pause() : resume();
  };

  // 进度 → 当前时间显示（与原型一致的近似换算）
  const curMin = Math.floor(progress * 0.36);
  const curSec = String(Math.floor((progress * 21.6) % 60)).padStart(2, '0');

  return (
    <View
      className="mini-player"
      style={{
        borderColor: A.a40(el.primary),
        boxShadow: `0 -20rpx 80rpx ${el.glow}`
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
          <Icon name={el.icon as IconName} size={36} color={el.primary} strokeWidth={1.5} />
        </View>

        <View className="mini-player__info">
          <Text className="mini-player__title">{currentTrack.title}</Text>
          <View className="mini-player__row">
            <Text className="mini-player__time cormorant" style={{ color: el.accent }}>
              {curMin}:{curSec}
            </Text>
            <View className="mini-player__bar">
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
          {isLoading ? (
            <View className="mini-player__spinner" />
          ) : isPlaying ? (
            <Icon name="pause" size={28} fill="#0a0e1a" strokeWidth={0} color="#0a0e1a" />
          ) : (
            <Icon name="play" size={28} fill="#0a0e1a" strokeWidth={0} color="#0a0e1a" />
          )}
        </View>
      </View>

      <SleepTimer open={timerOpen} onClose={() => setTimerOpen(false)} />
    </View>
  );
}
