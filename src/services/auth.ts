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

// 微信 H5 登录结果：
// - user 为 null 表示正在跳转微信授权页（页面即将卸载）；
// - devGuest=true 表示公众号未配置、走了「开发游客兜底」（并非真实微信登录），
//   供 UI 醒目提示；配好公众号 / 生产关 DEBUG 后此分支不再触发，提示自动消失。
export interface WechatH5LoginResult {
  user: User | null;
  devGuest: boolean;
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
export async function wechatLoginH5(): Promise<WechatH5LoginResult> {
  const guest = getGuestOpenid();

  if (USE_MOCK) {
    const user = mockUser(`mock-openid-h5-${guest.slice(0, 12)}`);
    persistLogin({ token: `mock-token-h5-${guest.slice(0, 12)}`, user });
    return { user, devGuest: true };
  }

  const loc = typeof window !== 'undefined' ? window.location : null;
  const code = loc ? new URLSearchParams(loc.search).get('code') : null;

  // 已从微信授权回跳（地址栏带 code）：换取 token —— 真实微信登录
  if (code) {
    const result = await request<LoginResult>('/api/mp/h5/login', {
      method: 'POST',
      data: { code, guestId: guest },
      auth: false
    });
    return { user: persistLogin(result), devGuest: false };
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
    // 已配公众号：跳转微信授权页，函数不再返回有效 user（页面即将卸载）
    loc.replace(oauth.url);
    return { user: null, devGuest: false };
  }

  // 后端未配置公众号：游客兜底登录（仅开发态，生产后端会 503）——标记 devGuest 供 UI 提示
  console.warn('[H5] 公众号未配置，走「开发游客兜底登录」（非真实微信登录）');
  const result = await request<LoginResult>('/api/mp/h5/login', {
    method: 'POST',
    data: { guestId: guest },
    auth: false
  });
  return { user: persistLogin(result), devGuest: true };
}

/** 扫码授权回跳的 state 前缀，与公众号的 state=wx 区分开 */
const QR_STATE = 'wxqr';
// 一次性随机串，跟着 state 走一圈再比对，挡登录 CSRF（攻击者把自己的 code
// 塞给受害者，让受害者登录成攻击者的账号）。存 sessionStorage 而不是 Taro storage：
// 它天然是标签页级、关掉即失效，正合「一次授权」的生命周期。
const QR_NONCE_KEY = 'wx_qr_nonce';

function issueQrNonce(): string {
  const nonce = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  try {
    sessionStorage.setItem(QR_NONCE_KEY, nonce);
  } catch {
    // 隐私模式下 sessionStorage 可能不可写：降级为不带 nonce，功能仍可用
  }
  return nonce;
}

// 回跳带的 state 是否是本次扫码授权的（且 nonce 对得上）。
// nonce 一经校验立即作废，避免同一个 state 被重复消费。
function matchQrState(state: string | null): boolean {
  if (!state || (state !== QR_STATE && !state.startsWith(`${QR_STATE}.`))) return false;
  const got = state.includes('.') ? state.slice(QR_STATE.length + 1) : '';
  let want = '';
  try {
    want = sessionStorage.getItem(QR_NONCE_KEY) || '';
    sessionStorage.removeItem(QR_NONCE_KEY);
  } catch {
    want = '';
  }
  // 两边都没有 nonce 时放行（sessionStorage 不可用的降级路径）；
  // 一旦本地存过就必须对上，对不上说明这个回跳不是本人发起的。
  if (!want) return true;
  return got === want;
}

// ── 微信扫码登录（H5 · 微信外浏览器）──────────────────
// 走开放平台「网站应用」的 qrconnect。与公众号那套的区别不只是 scope：
// 公众号的 snsapi_base 在微信外浏览器打开只会显示「请在微信客户端打开」，
// 这条路在浏览器里从来就是断的，扫码登录才是浏览器端唯一能用的微信登录。
//
// 流程与 wechatLoginH5 同构：地址栏带 code（且 state=wxqr）→ 换 token；
// 无 code → 取跳转地址并 replace 跳转（返回 user=null，页面即将卸载）。
export async function wechatQrLoginH5(): Promise<WechatH5LoginResult> {
  const guest = getGuestOpenid();

  if (USE_MOCK) {
    const user = mockUser(`mock-openid-qr-${guest.slice(0, 12)}`);
    persistLogin({ token: `mock-token-qr-${guest.slice(0, 12)}`, user });
    return { user, devGuest: true };
  }

  const loc = typeof window !== 'undefined' ? window.location : null;
  const params = loc ? new URLSearchParams(loc.search) : null;
  // 必须连 state 一起判断：公众号授权回跳带的是 state=wx，
  // 只看 code 会把公众号的 code 拿去换网站应用的 token，必然失败。
  const code = matchQrState(params?.get('state') ?? null) ? params!.get('code') : null;

  if (code) {
    const result = await request<LoginResult>('/api/mp/h5/qrlogin', {
      method: 'POST',
      data: { code, guestId: guest },
      auth: false
    });
    return { user: persistLogin(result), devGuest: false };
  }

  // ⚠️ 回跳地址**必须不带 hash**。微信是把 `?code=..&state=..` 直接拼在 redirect_uri
  // 末尾的，而 Taro H5 是 hash 路由——传 `https://站点/#/pages/login/index` 回来就成了
  // `https://站点/#/pages/login/index?code=..`，code 落在 fragment 里，
  // `location.search` 是空的，登录静默失败且毫无线索。
  // 所以这里只取 origin + pathname，回跳后由 app.tsx 全局接管（落地是首页，不是登录页）。
  const redirect = loc ? `${loc.origin}${loc.pathname}` : '';
  const oauth = await request<{ url: string; configured: boolean }>(
    `/api/mp/h5/qrlogin-url?redirect=${encodeURIComponent(redirect)}&nonce=${issueQrNonce()}`,
    { auth: false }
  );

  if (oauth.configured && oauth.url && loc) {
    loc.replace(oauth.url);
    return { user: null, devGuest: false };
  }

  // 后端未配网站应用：游客兜底（仅开发态，生产后端回 503）
  console.warn('[H5] 开放平台网站应用未配置，走「开发游客兜底登录」（非真实微信登录）');
  const result = await request<LoginResult>('/api/mp/h5/qrlogin', {
    method: 'POST',
    data: { guestId: guest },
    auth: false
  });
  return { user: persistLogin(result), devGuest: true };
}

/** 后端是否配了开放平台「网站应用」。没配就别渲染「微信扫码登录」入口——
 *  生产未配时后端回 503，留个点了就报错的死按钮不如不给。 */
export async function isQrLoginConfigured(): Promise<boolean> {
  if (USE_MOCK) return true;
  try {
    const r = await request<{ url: string; configured: boolean }>(
      '/api/mp/h5/qrlogin-url?redirect=',
      { auth: false }
    );
    return !!r.configured;
  } catch {
    return false;
  }
}

/** 当前地址栏是否是扫码授权的回跳（登录页据此在挂载时自动完成登录）。
 *  只看形状不校验 nonce——nonce 一验就作废，这里验了后面换 token 那步就没得验了。 */
export function hasQrLoginCallback(): boolean {
  if (typeof window === 'undefined') return false;
  const p = new URLSearchParams(window.location.search);
  const state = p.get('state') || '';
  return (state === QR_STATE || state.startsWith(`${QR_STATE}.`)) && !!p.get('code');
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
