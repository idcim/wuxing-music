import Taro from '@tarojs/taro';
import { USE_MOCK, TOKEN_KEY } from '@/constants/env';
import { storage, STORAGE_KEYS } from '@/services/storage';
import { request } from '@/services/api';
import type { User } from '@/types';

interface LoginResult {
  token: string;
  user: User;
}

function mockUser(openid: string): User {
  return {
    id: openid,
    openid,
    nickname: '律音用户',
    avatar: '',
    element: storage.get(STORAGE_KEYS.ELEMENT),
    elementScores: storage.get(STORAGE_KEYS.SCORES) || { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 },
    quizCompletedAt: null,
    membership: {
      type: 'free',
      name: '听闻',
      startAt: null,
      expireAt: null,
      source: null
    },
    createdAt: new Date().toISOString()
  };
}

// wx.login 拿临时 code → 后端换 token + 用户信息。
// 注意：真实环境后端用 code 调微信接口换 openid/unionid；当前后端 /api/mp/login
// 直接接收 openid，故此处以 code 充当 openid 占位（联调用）。生产应改为后端 code 换取。
export async function wxLogin(): Promise<LoginResult> {
  const { code } = await Taro.login();

  if (USE_MOCK) {
    const token = `mock-token-${code.slice(0, 8)}`;
    const user = mockUser(`mock-openid-${code.slice(0, 8)}`);
    storage.set(TOKEN_KEY, token);
    storage.set(STORAGE_KEYS.USER, user);
    return { token, user };
  }

  const result = await request<LoginResult>('/api/mp/login', {
    method: 'POST',
    data: { openid: code },
    auth: false
  });
  storage.set(TOKEN_KEY, result.token);
  storage.set(STORAGE_KEYS.USER, result.user);
  return result;
}

export async function fetchProfile(): Promise<User> {
  if (USE_MOCK) {
    const cached = storage.get<User>(STORAGE_KEYS.USER);
    if (cached) return cached;
    throw new Error('未登录');
  }
  return request<User>('/api/mp/profile');
}

export function getToken(): string | null {
  return storage.get<string>(TOKEN_KEY);
}

export function clearAuth(): void {
  storage.remove(TOKEN_KEY);
  storage.remove(STORAGE_KEYS.USER);
}
