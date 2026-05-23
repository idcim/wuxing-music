import { useState } from 'react';
import { View, Text, Input } from '@tarojs/components';
import { redeemCdkey } from '@/services/cdkey';
import { useUserStore } from '@/stores/user';
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
  const [msg, setMsg] = useState('');

  const reset = () => {
    setCode('');
    setStatus('idle');
    setMsg('');
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
      setMsg(`${res.data.plan} · ${res.data.days} 天`);
      updateMembership({
        type: res.data.type,
        name: res.data.plan,
        startAt: new Date().toISOString(),
        expireAt: res.data.expireAt,
        source: 'cdkey'
      });
    } else {
      setStatus(res.reason === 'used' ? 'used' : 'error');
      setMsg(res.reason === 'used' ? '该兑换码已被使用' : '兑换码无效，请检查后重试');
    }
  };

  if (!open) return null;

  return (
    <View className="cdkey-mask" onClick={close}>
      <View className="cdkey-sheet" onClick={(e) => e.stopPropagation()}>
        <View className="cdkey-sheet__handle" />
        <Text className="cdkey-sheet__title serif">兑换会员</Text>
        <Text className="cdkey-sheet__sub">输入兑换码，解锁专属音律权益</Text>

        {status === 'success' ? (
          <View className="cdkey-sheet__result cdkey-sheet__result--ok">
            <Text className="cdkey-sheet__result-icon">✓</Text>
            <Text className="cdkey-sheet__result-title">兑换成功</Text>
            <Text className="cdkey-sheet__result-msg">{msg}</Text>
            <View className="cdkey-sheet__btn" onClick={close}>
              <Text className="cdkey-sheet__btn-text">完成</Text>
            </View>
          </View>
        ) : (
          <View>
            <Input
              className="cdkey-sheet__input"
              placeholder="WUXING-2026-XXXX-XXXX"
              placeholderStyle="color:#475569"
              value={code}
              onInput={(e) => setCode(e.detail.value.toUpperCase())}
            />
            {!!msg && (
              <Text className={`cdkey-sheet__hint cdkey-sheet__hint--${status}`}>{msg}</Text>
            )}
            <View
              className={`cdkey-sheet__btn ${!code.trim() ? 'cdkey-sheet__btn--disabled' : ''}`}
              onClick={redeem}
            >
              <Text className="cdkey-sheet__btn-text">
                {status === 'loading' ? '兑换中…' : '立即兑换'}
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
