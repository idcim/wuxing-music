import { useEffect } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { usePlayerStore } from '@/stores/player';
import { useUserStore } from '@/stores/user';
import { WUXING } from '@/constants/wuxing';
import type { ElementId } from '@/types';
import './index.scss';

export default function MiniPlayer() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isLoading = usePlayerStore((s) => s.isLoading);
  const progress = usePlayerStore((s) => s.progress);
  const pause = usePlayerStore((s) => s.pause);
  const resume = usePlayerStore((s) => s.resume);
  const showUpgrade = usePlayerStore((s) => s.showUpgrade);
  const dismissUpgrade = usePlayerStore((s) => s.dismissUpgrade);
  const element = useUserStore((s) => s.element) || ('木' as ElementId);

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

  return (
    <View className="mini-player">
      <View className="mini-player__bar">
        <View
          className="mini-player__bar-fill"
          style={{ width: `${progress}%`, background: el.primary }}
        />
      </View>
      <View className="mini-player__body">
        <View className="mini-player__dot" style={{ background: el.primary }} />
        <View className="mini-player__info">
          <Text className="mini-player__title">{currentTrack.title}</Text>
          <Text className="mini-player__hz serif" style={{ color: el.accent }}>
            {currentTrack.hz} · {currentTrack.tag}
          </Text>
        </View>
        <View
          className="mini-player__toggle"
          style={{ background: el.primary }}
          onClick={toggle}
        >
          {isLoading ? (
            <View className="mini-player__spinner" />
          ) : (
            <Text className="mini-player__toggle-icon">{isPlaying ? '‖' : '▶'}</Text>
          )}
        </View>
      </View>
    </View>
  );
}
