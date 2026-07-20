import Taro from '@tarojs/taro';
import { USE_MOCK, TOKEN_KEY } from '@/constants/env';
import { storage, STORAGE_KEYS } from '@/services/storage';
import { request } from '@/services/api';
import type { User } from '@/types';

interface LoginResult {
  token: string;
  user: User;
}

// 短信验证码场景：登录 / 绑定 / 重置密码等，默认登录。
export type SmsScene = 'login' | 'bind' | 'reset';

export interface SmsSendResult {
  sent: boolean;
  devCode?: string;          // 开发/mock 期直接下发验证码，便于联调（生产不返回）
}

// 落地登录态：token 存 TOKEN_KEY、user 存 USER（与 wxLogin 一致），返回 user。
function persistLogin(result: LoginResult): User {
  storage.set(TOKEN_KEY, result.token);
  storage.set(STORAGE_KEYS.USER, result.user);
  return result.user;
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

// ── 手机号登录（H5 主路径）─────────────────────────────

// 发送短信验证码。mock 下直接下发固定码，便于无短信通道联调。
export async function sendSmsCode(phone: string, scene: SmsScene = 'login'): Promise<SmsSendResult> {
  if (USE_MOCK) {
    return { sent: true, devCode: '123456' };
  }
  return request<SmsSendResult>('/api/mp/sms/send', {
    method: 'POST',
    data: { phone, scene },
    auth: false
  });
}

// 手机号 + 验证码登录，成功后落地登录态并返回 user。
export async function loginByPhone(phone: string, code: string): Promise<User> {
  if (USE_MOCK) {
    const user = mockUser(`mock-openid-phone-${phone}`);
    user.phone = phone;
    return persistLogin({ token: `mock-token-phone-${phone.slice(-4)}`, user });
  }
  const result = await request<LoginResult>('/api/mp/login/phone', {
    method: 'POST',
    data: { phone, code },
    auth: false
  });
  return persistLogin(result);
}

// 手机号 + 密码登录，成功后落地登录态并返回 user。
export async function loginByPassword(phone: string, password: string): Promise<User> {
  if (USE_MOCK) {
    const user = mockUser(`mock-openid-pwd-${phone}`);
    user.phone = phone;
    return persistLogin({ token: `mock-token-pwd-${phone.slice(-4)}`, user });
  }
  const result = await request<LoginResult>('/api/mp/login/password', {
    method: 'POST',
    data: { phone, password },
    auth: false
  });
  return persistLogin(result);
}

// 设置/修改登录密码（需登录态）。
export async function setPassword(password: string): Promise<void> {
  if (USE_MOCK) return;
  await request<{ ok: boolean }>('/api/mp/set-password', {
    method: 'POST',
    data: { password }
  });
}

// ── 微信网页授权登录（H5 公众号内）───────────────────────
// 流程：地址栏带 code → 用 code 换 token；无 code → 取授权跳转地址并 replace 跳转
//（此时函数返回 null，页面即将卸载）；后端未配置公众号时 → 用游客 id 兜底登录（dev）。
export async function wechatLoginH5(): Promise<User | null> {
  const guest = getGuestOpenid();

  if (USE_MOCK) {
    const user = mockUser(`mock-openid-h5-${guest.slice(0, 12)}`);
    return persistLogin({ token: `mock-token-h5-${guest.slice(0, 12)}`, user });
  }

  const loc = typeof window !== 'undefined' ? window.location : null;
  const code = loc ? new URLSearchParams(loc.search).get('code') : null;

  // 已从微信授权回跳（地址栏带 code）：换取 token
  if (code) {
    const result = await request<LoginResult>('/api/mp/h5/login', {
      method: 'POST',
      data: { code, guestId: guest },
      auth: false
    });
    return persistLogin(result);
  }

  // 无 code：向后端要授权跳转地址（redirect 为当前不含 code/state 的完整 URL）
  let redirect = '';
  if (loc) {
    const u = new URL(loc.href);
    u.searchParams.delete('code');
    u.searchParams.delete('state');
    redirect = u.href;
  }
  const oauth = await request<{ url: string; configured: boolean }>(
    `/api/mp/h5/oauth-url?redirect=${encodeURIComponent(redirect)}`,
    { auth: false }
  );

  if (oauth.configured && oauth.url && loc) {
    // 跳转到微信授权页，函数不再返回有效 user（页面即将卸载）
    loc.replace(oauth.url);
    return null;
  }

  // 后端未配置公众号：游客兜底登录（dev）
  const result = await request<LoginResult>('/api/mp/h5/login', {
    method: 'POST',
    data: { guestId: guest },
    auth: false
  });
  return persistLogin(result);
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
