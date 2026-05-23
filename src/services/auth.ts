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

const GUEST_OPENID_KEY = 'wx_guest_openid';

// 获取登录标识（code/openid）。Taro.login() 在开发者工具游客模式下会抛
// webapi_getwxaasyncsecinfo:fail，此处兜底为本地持久化的稳定游客 openid，
// 保证登录链路不依赖 wx.login 也能跑通（联调/真机降级都安全）。
async function resolveLoginId(): Promise<string> {
  try {
    const { code } = await Taro.login();
    if (code) return code;
  } catch {
    // 游客模式 / login 受限：走本地游客标识
  }
  let guest = storage.get<string>(GUEST_OPENID_KEY);
  if (!guest) {
    guest = `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    storage.set(GUEST_OPENID_KEY, guest);
  }
  return guest;
}

// 拿登录标识 → 后端换 token + 用户信息。
// 注意：真实环境后端用 code 调微信接口换 openid/unionid；当前后端 /api/mp/login
// 直接接收 openid，故此处以 code/游客标识 充当 openid（联调用）。生产应改为后端 code 换取。
export async function wxLogin(): Promise<LoginResult> {
  const code = await resolveLoginId();

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
