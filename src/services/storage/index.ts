import Taro from '@tarojs/taro';

// Taro 统一封装了多端存储 API，无需分平台
export const storage = {
  get<T = unknown>(key: string): T | null {
    try {
      const v = Taro.getStorageSync(key);
      return v === '' ? null : (v as T);
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown): void {
    try {
      Taro.setStorageSync(key, value);
    } catch {
      // ignore
    }
  },
  remove(key: string): void {
    try {
      Taro.removeStorageSync(key);
    } catch {
      // ignore
    }
  }
};

export const STORAGE_KEYS = {
  USER: 'wx_user',
  ELEMENT: 'wx_element',
  SCORES: 'wx_scores',
  ONBOARDED: 'wx_onboarded'
} as const;
