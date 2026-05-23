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
  // 默认昵称带随机后缀，便于区分（与后端一致）
  const suffix = openid.slice(-4).toUpperCase();
  return {
    id: openid,
    openid,
    nickname: `律音用户·${suffix}`,
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

// 稳定的本地游客标识（仅作兜底：游客模式 / 未配置小程序密钥时使用）。
// 一次生成、长期复用，保证没有 code 换取时身份也不漂移。
function getGuestOpenid(): string {
  let guest = storage.get<string>(GUEST_OPENID_KEY);
  if (!guest) {
    guest = `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    storage.set(GUEST_OPENID_KEY, guest);
  }
  return guest;
}

// 取 wx.login 的临时 code（一次性、每次不同，仅供后端换 openid 用）。
// 游客模式 / login 受限时返回空串，由后端走 openid 兜底。
async function getLoginCode(): Promise<string> {
  try {
    const { code } = await Taro.login();
    return code || '';
  } catch {
    return '';
  }
}

// 登录：把 code（后端用它换稳定 openid）+ 稳定游客 openid 一起传给后端。
// 关键：绝不能把每次都变的 code 当 openid 用，否则后端每次都建新用户、openid 漂移。
export async function wxLogin(): Promise<LoginResult> {
  const guest = getGuestOpenid();

  if (USE_MOCK) {
    const token = `mock-token-${guest.slice(0, 12)}`;
    const user = mockUser(`mock-openid-${guest.slice(0, 12)}`);
    storage.set(TOKEN_KEY, token);
    storage.set(STORAGE_KEYS.USER, user);
    return { token, user };
  }

  const code = await getLoginCode();
  const result = await request<LoginResult>('/api/mp/login', {
    method: 'POST',
    data: { code, openid: guest },
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
