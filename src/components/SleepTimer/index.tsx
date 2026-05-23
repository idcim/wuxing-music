import { View, Text } from '@tarojs/components';
import { usePlayerStore } from '@/stores/player';
import { useUserStore } from '@/stores/user';
import { WUXING } from '@/constants/wuxing';
import type { ElementId } from '@/types';
import './index.scss';

const PRESETS = [15, 30, 45, 60];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SleepTimer({ open, onClose }: Props) {
  const timerVal = usePlayerStore((s) => s.timerVal);
  const setTimer = usePlayerStore((s) => s.setTimer);
  const element = useUserStore((s) => s.element) || ('木' as ElementId);
  const el = WUXING[element];

  if (!open) return null;

  const choose = (m: number) => {
    setTimer(m === timerVal ? null : m);
  };

  return (
    <View className="sleep-timer-mask" onClick={onClose}>
      <View className="sleep-timer" onClick={(e) => e.stopPropagation()}>
        <View className="sleep-timer__handle" />
        <Text className="sleep-timer__title serif">睡眠定时</Text>
        <Text className="sleep-timer__sub">
          {timerVal ? `${timerVal} 分钟后自动停止播放` : '到点自动停止，安心入眠'}
        </Text>

        <View className="sleep-timer__grid">
          {PRESETS.map((m) => {
            const active = timerVal === m;
            return (
              <View
                key={m}
                className="sleep-timer__pill"
                style={{
                  background: active ? `${el.primary}33` : undefined,
                  borderColor: active ? `${el.primary}80` : undefined
                }}
                onClick={() => choose(m)}
              >
                <Text
                  className="sleep-timer__pill-num"
                  style={{ color: active ? el.primary : undefined }}
                >
                  {m}
                </Text>
                <Text
                  className="sleep-timer__pill-unit"
                  style={{ color: active ? el.primary : undefined }}
                >
                  min
                </Text>
              </View>
            );
          })}
        </View>

        {!!timerVal && (
          <View className="sleep-timer__cancel" onClick={() => setTimer(null)}>
            <Text className="sleep-timer__cancel-text">取消定时</Text>
          </View>
        )}
      </View>
    </View>
  );
}
