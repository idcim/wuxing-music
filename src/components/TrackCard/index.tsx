import { View, Text, Image } from '@tarojs/components';
import Icon from '@/components/Icon';
import { A } from '@/utils/color';
import { resolveUrl } from '@/utils/url';
import type { Track, WuxingElement } from '@/types';
import './index.scss';

interface Props {
  track: Track;
  element: WuxingElement;
  isActive: boolean;
  isPlaying: boolean;
  // 会员专属且当前用户非会员。**不等于不能播**——可以试听 previewSec 秒，
  // 到点由 player store 断流并弹升级引导。这里只负责把「会员专属」标出来。
  locked?: boolean;
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
        {/* 有封面则铺底显示，播放图标叠在半透明蒙版上 */}
        {track.coverUrl && (
          <Image
            className="track-card__cover"
            src={resolveUrl(track.coverUrl)}
            mode="aspectFill"
          />
        )}
        {track.coverUrl && <View className="track-card__cover-mask" />}
        {/* 会员专属也画播放键：画锁头会让人以为点不动，而它其实能试听。
            「会员专属」的信息由右侧的试听徽标承担。 */}
        {isActive ? (
          <Icon name="pause" size={28} fill={track.coverUrl ? '#fff' : '#0a0e1a'} strokeWidth={0} color={track.coverUrl ? '#fff' : '#0a0e1a'} />
        ) : (
          <Icon name="play" size={26} fill={track.coverUrl ? '#fff' : el.primary} strokeWidth={0} color={track.coverUrl ? '#fff' : el.primary} />
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

      {locked ? (
        <View className="track-card__preview" style={{ borderColor: A.a30(el.primary) }}>
          <Icon name="crown" size={20} color={el.accent} strokeWidth={1.6} />
          <Text className="track-card__preview-text" style={{ color: el.accent }}>
            试听 {track.previewSec ?? 30}s
          </Text>
        </View>
      ) : (
        <Text
          className="track-card__tag"
          style={{ background: A.a15(el.primary), color: el.accent }}
        >
          {track.tag}
        </Text>
      )}
    </View>
  );
}
