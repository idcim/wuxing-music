import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { TOKEN_KEY } from '@/constants/env';
import { APP_VERSION } from '@/constants/version';
import { STORAGE_KEYS } from '@/services/storage';
import { isWeapp } from '@/utils/platform';
import { goBack } from '@/utils/nav';
import Icon from '@/components/Icon';
import './index.scss';

// 清缓存时需要保留的键（保持登录态与身份不丢）
const KEEP_KEYS = [TOKEN_KEY, 'wx_guest_openid', STORAGE_KEYS.USER];

// H5 的 getStorageInfoSync 只返回 keys，limitSize / currentSize 都是 NaN
// （taro-h5 api/storage），拿不到真实占用；小程序才有实测值。
function readCacheKB(): number | null {
  if (!isWeapp) return null;
  try {
    return Taro.getStorageInfoSync().currentSize || 0;
  } catch {
    return null;
  }
}

// 小程序能读到微信平台上的线上版本号；H5 没有该 API，用构建时写死的 APP_VERSION。
function readVersion(): string {
  if (!isWeapp) return APP_VERSION;
  try {
    const acc: any = Taro.getAccountInfoSync?.();
    return acc?.miniProgram?.version || APP_VERSION;
  } catch {
    return APP_VERSION;
  }
}

export default function Settings() {
  const [cacheKB, setCacheKB] = useState<number | null>(null);
  const [version, setVersion] = useState(APP_VERSION);

  useDidShow(() => {
    setCacheKB(readCacheKB());
    setVersion(readVersion());
  });

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
        setCacheKB(readCacheKB());
        Taro.showToast({ title: '已清除', icon: 'success' });
      }
    });
  };

  return (
    <View className="settings">
      <View className="settings__nav">
        <Text className="settings__back" onClick={() => goBack()}>‹</Text>
        <Text className="settings__nav-title">设置</Text>
        <View className="settings__nav-spacer" />
      </View>

      <View className="settings__list">
        <View className="settings__row settings__row--divider" onClick={clearCache}>
          <Text className="settings__label">清除缓存</Text>
          <View className="settings__row-right">
            {/* H5 读不到真实占用，就别显示一个恒为 0 的假数字 */}
            {cacheKB !== null && <Text className="settings__value">{cacheKB} KB</Text>}
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
