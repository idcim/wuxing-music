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
  ONBOARDED: 'wx_onboarded',
  SITE: 'wx_site',                     // 站点信息（品牌名/副标题/LOGO），冷启动先用缓存避免闪默认名
  QUIZ_PROGRESS: 'wx_quiz_progress',  // 测评中途进度（答完即清）
  SLEEP_DEADLINE: 'wx_sleep_deadline', // 睡眠定时截止时间戳（抗后台节流/刷新）
  // 扫码带进来的代理推广码：进入时可能还没登录，先存着，登录后再提交绑定
  PENDING_AGENT: 'wx_pending_agent'
} as const;
