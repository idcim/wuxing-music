import { useState } from 'react';
import { View, Text, Input } from '@tarojs/components';
import { redeemCdkey } from '@/services/cdkey';
import { useUserStore } from '@/stores/user';
import Icon from '@/components/Icon';
import type { CdkeyStatus } from '@/types';
import './index.scss';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CdkeyModal({ open, onClose }: Props) {
  const updateMembership = useUserStore((s) => s.updateMembership);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<CdkeyStatus>('idle');
  const [planName, setPlanName] = useState('');
  const [days, setDays] = useState(0);

  const reset = () => {
    setCode('');
    setStatus('idle');
    setPlanName('');
    setDays(0);
  };

  const close = () => {
    reset();
    onClose();
  };

  const redeem = async () => {
    if (!code.trim() || status === 'loading') return;
    setStatus('loading');
    const res = await redeemCdkey(code);
    if (res.ok) {
      setStatus('success');
      setPlanName(res.data.plan);
      setDays(res.data.days);
      updateMembership({
        type: res.data.type,
        name: res.data.plan,
        startAt: new Date().toISOString(),
        expireAt: res.data.expireAt,
        source: 'cdkey'
      });
    } else {
      setStatus(res.reason === 'used' ? 'used' : 'error');
    }
  };

  if (!open) return null;

  const canRedeem = !!code.trim() && status !== 'loading';

  return (
    <View className="cdkey-mask" onClick={close}>
      <View className="cdkey-sheet" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <View className="cdkey-sheet__head">
          <View>
            <Text className="cdkey-sheet__eyebrow cormorant italic">Redeem Code</Text>
            <Text className="cdkey-sheet__title">兑换码</Text>
          </View>
          <View className="cdkey-sheet__close" onClick={close}>
            <Icon name="x" size={28} color="#94a3b8" strokeWidth={2} />
          </View>
        </View>

        {/* 成功 */}
        {status === 'success' && (
          <View className="cdkey-sheet__result fade-up">
            <View className="cdkey-sheet__circle cdkey-sheet__circle--ok">
              <Icon name="check" size={64} color="#84cc16" strokeWidth={2} />
            </View>
            <Text className="cdkey-sheet__result-title">兑换成功</Text>
            <Text className="cdkey-sheet__result-msg">
              您已获得 <Text className="cdkey-sheet__result-plan">{planName}</Text>
            </Text>
            <Text className="cdkey-sheet__result-sub">有效期 {days} 天</Text>
            <View className="cdkey-sheet__action cdkey-sheet__action--light" onClick={close}>
              <Text className="cdkey-sheet__action-text cdkey-sheet__action-text--dark">开始享受</Text>
            </View>
          </View>
        )}

        {/* 失败 */}
        {status === 'error' && (
          <View className="cdkey-sheet__result fade-up">
            <View className="cdkey-sheet__circle cdkey-sheet__circle--err">
              <Icon name="x" size={64} color="#f87171" strokeWidth={2} />
            </View>
            <Text className="cdkey-sheet__result-title">兑换码无效</Text>
            <Text className="cdkey-sheet__result-sub">请检查是否输入正确，或联系客服</Text>
            <View className="cdkey-sheet__action cdkey-sheet__action--ghost" onClick={reset}>
              <Text className="cdkey-sheet__action-text">重新输入</Text>
            </View>
          </View>
        )}

        {/* 已使用 */}
        {status === 'used' && (
          <View className="cdkey-sheet__result fade-up">
            <View className="cdkey-sheet__circle cdkey-sheet__circle--used">
              <Icon name="clock" size={64} color="#eab308" strokeWidth={2} />
            </View>
            <Text className="cdkey-sheet__result-title">该兑换码已使用</Text>
            <Text className="cdkey-sheet__result-sub">此兑换码已被绑定至当前账户</Text>
            <View className="cdkey-sheet__action cdkey-sheet__action--ghost" onClick={reset}>
              <Text className="cdkey-sheet__action-text">重新输入</Text>
            </View>
          </View>
        )}

        {/* 输入界面 */}
        {(status === 'idle' || status === 'loading') && (
          <View>
            <View className="cdkey-sheet__tip">
              <View className="cdkey-sheet__tip-icon">
                <Icon name="keyRound" size={40} color="#38bdf8" strokeWidth={1.5} />
              </View>
              <View className="cdkey-sheet__tip-text">
                <Text className="cdkey-sheet__tip-title">输入您的兑换码</Text>
                <Text className="cdkey-sheet__tip-sub">支持会员卡、礼品卡、活动福利码</Text>
              </View>
            </View>

            <Text className="cdkey-sheet__label cormorant italic">CDKEY</Text>
            <Input
              className="cdkey-sheet__input"
              placeholder="例如：WUXING-XXXX-XXXX-XXX"
              placeholderStyle="color:#475569"
              maxlength={32}
              value={code}
              onInput={(e) => setCode(e.detail.value.toUpperCase())}
            />

            <View
              className={`cdkey-sheet__action ${canRedeem ? 'cdkey-sheet__action--light' : 'cdkey-sheet__action--disabled'}`}
              onClick={redeem}
            >
              <Icon
                name="zap"
                size={28}
                color={canRedeem ? '#0a0e1a' : '#475569'}
                strokeWidth={2}
              />
              <Text
                className={`cdkey-sheet__action-text ${canRedeem ? 'cdkey-sheet__action-text--dark' : ''}`}
              >
                {status === 'loading' ? '兑换中…' : '立即兑换'}
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
