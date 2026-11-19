import { request } from '@/services/api';
import { storage, STORAGE_KEYS } from '@/services/storage';
import { TOKEN_KEY } from '@/constants/env';
import type { User } from '@/types';

let attempt = 0;
let pending: Promise<User> | null = null;

export async function appSmsAvailable(): Promise<boolean> {
  return (await request<{ sms_enabled: boolean }>('/api/app/auth/config', { auth: false })).sms_enabled === true;
}

export function cancelAppSmsLogin(): void { attempt++; pending = null; }

/** 返回或离开页面后，迟到的短信登录响应不写入账号缓存。 */
export function loginAppBySms(phone: string, code: string): Promise<User> {
  if (pending) return pending;
  const current = ++attempt;
  pending = (async () => {
    const result = await request<{ token: string; user: User }>('/api/mp/login/phone', {
      method: 'POST', auth: false, data: { phone, code },
    });
    if (current !== attempt) throw new Error('已取消登录');
    storage.set(TOKEN_KEY, result.token);
    storage.set(STORAGE_KEYS.USER, result.user);
    return result.user;
  })().finally(() => { if (current === attempt) pending = null; });
  return pending;
}
