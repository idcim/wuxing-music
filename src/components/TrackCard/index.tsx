import { View, Text } from '@tarojs/components';
import type { Track, WuxingElement } from '@/types';
import './index.scss';

interface Props {
  track: Track;
  element: WuxingElement;
  isActive: boolean;
  isPlaying: boolean;
  locked?: boolean;          // 会员锁（非会员看付费曲目）
  onPlay: () => void;
}

export default function TrackCard({
  track, element: el, isActive, isPlaying, locked, onPlay
}: Props) {
  return (
    <View
      className={`track-card ${isActive ? 'track-card--active' : ''} fade-up`}
      style={{
        background: isActive ? `${el.primary}10` : undefined,
        borderColor: isActive ? `${el.primary}66` : undefined
      }}
      onClick={onPlay}
    >
      <View
        className="track-card__btn"
        style={{
          background: isActive ? el.primary : `${el.primary}26`,
          borderColor: isActive ? el.primary : `${el.primary}4d`
        }}
      >
        <Text
          className="track-card__icon"
          style={{ color: isActive ? '#0a0e1a' : el.primary }}
        >
          {locked ? '🔒' : isActive && isPlaying ? '‖' : '▶'}
        </Text>
      </View>

      <View className="track-card__info">
        <Text className="track-card__title">{track.title}</Text>
        <View className="track-card__meta">
          <Text className="track-card__hz serif" style={{ color: el.accent }}>{track.hz}</Text>
          <Text className="track-card__dot">·</Text>
          <Text className="track-card__sub">{track.duration}</Text>
          <Text className="track-card__dot">·</Text>
          <Text className="track-card__sub serif">{track.plays}</Text>
        </View>
      </View>

      <Text
        className="track-card__tag"
        style={{ background: `${el.primary}26`, color: el.accent }}
      >
        {track.tag}
      </Text>
    </View>
  );
}
