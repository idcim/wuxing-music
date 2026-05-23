import { View, Text } from '@tarojs/components';
import Icon from '@/components/Icon';
import { A } from '@/utils/color';
import type { Track, WuxingElement } from '@/types';
import './index.scss';

interface Props {
  track: Track;
  element: WuxingElement;
  isActive: boolean;
  isPlaying: boolean;
  locked?: boolean;          // 会员锁（非会员看付费曲目）
  onPlay: () => void;
  delay?: number;            // fade-up 进场延迟（秒）
}

export default function TrackCard({
  track, element: el, isActive, isPlaying, locked, onPlay, delay = 0
}: Props) {
  return (
    <View
      className={`track-card ${isActive ? 'track-card--active' : ''} fade-up`}
      style={{
        animationDelay: `${delay}s`,
        background: isActive ? A.a10(el.primary) : 'rgba(255,255,255,0.02)',
        borderColor: isActive ? A.a40(el.primary) : 'rgba(255,255,255,0.04)'
      }}
      onClick={onPlay}
    >
      <View
        className="track-card__btn"
        style={{
          background: isActive ? el.primary : A.a15(el.primary),
          borderColor: isActive ? el.primary : A.a30(el.primary)
        }}
      >
        {locked ? (
          <Text className="track-card__lock">🔒</Text>
        ) : isActive ? (
          <Icon name="pause" size={28} fill="#0a0e1a" strokeWidth={0} color="#0a0e1a" />
        ) : (
          <Icon name="play" size={26} fill={el.primary} strokeWidth={0} color={el.primary} />
        )}
      </View>

      <View className="track-card__info">
        <Text
          className="track-card__title"
          style={{ color: isActive ? '#e2e8f0' : '#cbd5e1', fontWeight: isActive ? 500 : 400 }}
        >
          {track.title}
        </Text>
        <View className="track-card__meta">
          <Text className="track-card__hz cormorant" style={{ color: el.accent }}>{track.hz}</Text>
          <Text className="track-card__dot">·</Text>
          <Text className="track-card__sub">{track.duration}</Text>
          <Text className="track-card__dot">·</Text>
          <Icon name="headphones" size={20} color="#475569" strokeWidth={1.5} />
          <Text className="track-card__plays cormorant">{track.plays}</Text>
        </View>
      </View>

      <Text
        className="track-card__tag"
        style={{ background: A.a15(el.primary), color: el.accent }}
      >
        {track.tag}
      </Text>
    </View>
  );
}
