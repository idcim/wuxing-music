import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { WUXING } from '@/constants/wuxing';
import { useUserStore } from '@/stores/user';
import { redeemCdkey } from '@/services/cdkey';
import type { ElementId, CdkeyStatus } from '@/types';
import './index.scss';

export default function Profile() {
  const element = useUserStore((s) => s.element);
  const updateMembership = useUserStore((s) => s.updateMembership);
  const el = element ? WUXING[element as ElementId] : null;

  const [code, setCode] = useState('');
  const [status, setStatus] = useState<CdkeyStatus>('idle');
  const [msg, setMsg] = useState('');

  const redeem = async () => {
    if (!code.trim()) return;
    setStatus('loading');
    const res = await redeemCdkey(code);
    if (res.ok) {
      setStatus('success');
      setMsg(`兑换成功：${res.data.plan} · ${res.data.days}天`);
      updateMembership({
        type: res.data.type,
        name: res.data.plan,
        startAt: new Date().toISOString(),
        expireAt: res.data.expireAt,
        source: 'cdkey'
      });
    } else {
      setStatus(res.reason === 'used' ? 'used' : 'error');
      setMsg(res.reason === 'used' ? '该兑换码已被使用' : '兑换码无效');
    }
  };

  const retakeQuiz = () => Taro.navigateTo({ url: '/pages/quiz/index' });

  return (
    <View className="profile">
      <Text className="profile__title serif">我的</Text>

      <View className="profile__card fade-up">
        <Text className="profile__card-label">本命五行</Text>
        <Text className="profile__card-el serif" style={{ color: el?.primary || '#e2e8f0' }}>
          {el ? `${el.id}型 · ${el.note}音` : '尚未测评'}
        </Text>
        <Text className="profile__card-link" onClick={retakeQuiz}>
          {el ? '重新测评 ›' : '立即测评 ›'}
        </Text>
      </View>

      <View className="profile__cdkey fade-up">
        <Text className="profile__cdkey-title">兑换码</Text>
        <View className="profile__cdkey-row">
          <input
            className="profile__cdkey-input"
            placeholder="输入兑换码"
            value={code}
            onInput={(e: any) => setCode(e.detail.value.toUpperCase())}
          />
          <View className="profile__cdkey-btn" onClick={redeem}>
            <Text className="profile__cdkey-btn-text">
              {status === 'loading' ? '兑换中…' : '兑换'}
            </Text>
          </View>
        </View>
        {!!msg && (
          <Text className={`profile__cdkey-msg profile__cdkey-msg--${status}`}>{msg}</Text>
        )}
      </View>
    </View>
  );
}
