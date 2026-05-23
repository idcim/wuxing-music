import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { TOKEN_KEY } from '@/constants/env';
import { STORAGE_KEYS } from '@/services/storage';
import Icon from '@/components/Icon';
import './index.scss';

// 清缓存时需要保留的键（保持登录态与身份不丢）
const KEEP_KEYS = [TOKEN_KEY, 'wx_guest_openid', STORAGE_KEYS.USER];

export default function Settings() {
  const [cacheKB, setCacheKB] = useState(0);
  const [version, setVersion] = useState('');

  useDidShow(() => {
    try {
      const info = Taro.getStorageInfoSync();
      setCacheKB(info.currentSize || 0);
    } catch {
      setCacheKB(0);
    }
    try {
      const acc: any = Taro.getAccountInfoSync?.();
      setVersion(acc?.miniProgram?.version || '');
    } catch {
      setVersion('');
    }
  });

  const back = () => Taro.navigateBack();
  const goAbout = () => Taro.navigateTo({ url: '/pages/about/index' });

  const clearCache = () => {
    Taro.showModal({
      title: '清除缓存',
      content: '将清理本地缓存（不影响登录与已购权益）',
      success: (res) => {
        if (!res.confirm) return;
        try {
          const info = Taro.getStorageInfoSync();
          (info.keys || []).forEach((k) => {
            if (!KEEP_KEYS.includes(k)) Taro.removeStorageSync(k);
          });
        } catch {
          // ignore
        }
        setCacheKB(() => {
          try {
            return Taro.getStorageInfoSync().currentSize || 0;
          } catch {
            return 0;
          }
        });
        Taro.showToast({ title: '已清除', icon: 'success' });
      }
    });
  };

  return (
    <View className="settings">
      <View className="settings__nav">
        <Text className="settings__back" onClick={back}>‹</Text>
        <Text className="settings__nav-title">设置</Text>
        <View className="settings__nav-spacer" />
      </View>

      <View className="settings__list">
        <View className="settings__row settings__row--divider" onClick={clearCache}>
          <Text className="settings__label">清除缓存</Text>
          <View className="settings__row-right">
            <Text className="settings__value">{cacheKB} KB</Text>
            <Icon name="chevronRight" size={28} color="#334155" strokeWidth={1.5} />
          </View>
        </View>

        <View className="settings__row" onClick={goAbout}>
          <Text className="settings__label">关于我们 / 服务条款</Text>
          <Icon name="chevronRight" size={28} color="#334155" strokeWidth={1.5} />
        </View>
      </View>

      <View className="settings__version">
        <Text className="settings__version-text">版本 {version || '—'}</Text>
      </View>
    </View>
  );
}
