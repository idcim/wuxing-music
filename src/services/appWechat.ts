import { registerPlugin } from '@capacitor/core';
import { request } from '@/services/api';
import { storage, STORAGE_KEYS } from '@/services/storage';
import { TOKEN_KEY } from '@/constants/env';
import { isAndroidApp } from '@/utils/platform';
import type { User } from '@/types';

interface AppWechatConfig { enabled: boolean; app_id: string; android_package: string; android_signature: string }
interface NativeWechat {
  cancel(): Promise<void>;
  authorize(options: { appId: string; state: string; packageName: string; signature: string }): Promise<{ code: string; state: string }>;
}
const nativeWechat = registerPlugin<NativeWechat>('AppWechat');
let pending: Promise<User> | null = null;
let attemptCounter = 0;

export function cancelAppWechatLogin(): void {
  attemptCounter++;
  pending = null;
  if (isAndroidApp) void nativeWechat.cancel().catch(() => {});
}

export async function appWechatAvailable(): Promise<boolean> {
  if (!isAndroidApp) return false;
  return (await request<AppWechatConfig>('/api/app/wechat/config', { auth: false })).enabled;
}

// 仅由用户勾选协议后的主动点击调用，不在启动或页面挂载时授权。
export function loginByAppWechat(): Promise<User> {
  if (!isAndroidApp) return Promise.reject(new Error('请在安卓 APP 中使用微信登录'));
  if (pending) return pending;
  const attempt = ++attemptCounter;
  const ensureActive = () => { if (attempt !== attemptCounter) throw new Error('已取消微信登录'); };
  pending = (async () => {
    const cfg = await request<AppWechatConfig>('/api/app/wechat/config', { auth: false });
    ensureActive();
    if (!cfg.enabled) throw new Error('APP 微信登录尚未开启');
    const challenge = await request<{ state: string; proof: string }>('/api/app/wechat/challenge', { method: 'POST', auth: false });
    ensureActive();
    const result = await nativeWechat.authorize({ appId: cfg.app_id, state: challenge.state, packageName: cfg.android_package, signature: cfg.android_signature });
    ensureActive();
    if (result.state !== challenge.state || !result.code) throw new Error('微信登录校验失败，请重试');
    const login = await request<{ token: string; user: User }>('/api/app/wechat/login', {
      method: 'POST', auth: false, data: { ...challenge, code: result.code },
    });
    ensureActive();
    storage.set(TOKEN_KEY, login.token);
    storage.set(STORAGE_KEYS.USER, login.user);
    return login.user;
  })().finally(() => { if (attempt === attemptCounter) pending = null; });
  return pending;
}
