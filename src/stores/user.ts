import { create } from 'zustand';
import type { User, Membership, ElementId, ElementScores } from '@/types';
import { storage, STORAGE_KEYS } from '@/services/storage';
import {
  wxLogin,
  fetchProfile,
  clearAuth,
  getToken,
  loginByPhone as apiLoginByPhone,
  loginByPassword as apiLoginByPassword,
  wechatLoginH5 as apiWechatLoginH5,
  type WechatH5LoginResult
} from '@/services/auth';

interface UserStore {
  user: User | null;
  element: ElementId | null;
  scores: ElementScores | null;
  isPremium: boolean;
  loggingIn: boolean;
  setUser: (u: User) => void;
  setElement: (el: ElementId, scores: ElementScores) => void;
  updateMembership: (m: Membership) => void;
  setPhone: (phone: string) => void;
  setProfile: (p: { nickname?: string; avatar?: string }) => void;
  login: () => Promise<User>;
  loginByPhone: (phone: string, code: string) => Promise<User>;
  loginByPassword: (phone: string, password: string) => Promise<User>;
  loginByWechatH5: () => Promise<WechatH5LoginResult>;
  initFromCache: () => Promise<void>;
  logout: () => void;
}

function computePremium(m?: Membership | null): boolean {
  if (!m || m.type === 'free' || !m.expireAt) return false;
  return new Date(m.expireAt).getTime() > Date.now();
}

function persistUser(user: User): void {
  storage.set(STORAGE_KEYS.USER, user);
}

export const useUserStore = create<UserStore>((set, get) => ({
  user: null,
  element: storage.get<ElementId>(STORAGE_KEYS.ELEMENT),
  scores: storage.get<ElementScores>(STORAGE_KEYS.SCORES),
  isPremium: false,
  loggingIn: false,

  setUser: (user) => {
    persistUser(user);
    set({
      user,
      element: user.element ?? get().element,
      isPremium: computePremium(user.membership)
    });
  },

  setElement: (element, scores) => {
    storage.set(STORAGE_KEYS.ELEMENT, element);
    storage.set(STORAGE_KEYS.SCORES, scores);
    const user = get().user;
    if (user) {
      const next = { ...user, element, elementScores: scores };
      persistUser(next);
      set({ user: next, element, scores });
    } else {
      set({ element, scores });
    }
  },

  updateMembership: (membership) =>
    set((state) => {
      const user = state.user ? { ...state.user, membership } : null;
      if (user) persistUser(user);
      return { user, isPremium: computePremium(membership) };
    }),

  setPhone: (phone) =>
    set((state) => {
      const user = state.user ? { ...state.user, phone } : null;
      if (user) persistUser(user);
      return { user };
    }),

  setProfile: (p) =>
    set((state) => {
      const user = state.user ? { ...state.user, ...p } : null;
      if (user) persistUser(user);
      return { user };
    }),

  login: async () => {
    if (get().loggingIn) {
      const u = get().user;
      if (u) return u;
    }
    set({ loggingIn: true });
    try {
      const { user } = await wxLogin();
      get().setUser(user);
      return user;
    } finally {
      set({ loggingIn: false });
    }
  },

  // H5：手机号 + 验证码登录
  loginByPhone: async (phone, code) => {
    const user = await apiLoginByPhone(phone, code);
    get().setUser(user);
    return user;
  },

  // H5：手机号 + 密码登录
  loginByPassword: async (phone, password) => {
    const user = await apiLoginByPassword(phone, password);
    get().setUser(user);
    return user;
  },

  // H5：微信网页授权登录（user 为 null 表示正跳转授权页；devGuest 表示开发游客兜底）
  loginByWechatH5: async () => {
    const res = await apiWechatLoginH5();
    if (res.user) get().setUser(res.user);
    return res;
  },

  // 启动时优先用缓存的登录态；token 失效(401)则清掉重新登录
  initFromCache: async () => {
    const cached = storage.get<User>(STORAGE_KEYS.USER);
    if (cached) {
      set({
        user: cached,
        element: cached.element ?? get().element,
        isPremium: computePremium(cached.membership)
      });
    }

    if (getToken()) {
      try {
        const fresh = await fetchProfile();
        get().setUser(fresh);
        return;
      } catch (e: any) {
        // token 失效（如旧 mock token / 过期）：清理后走静默登录
        if (e?.code === 401) {
          clearAuth();
        } else {
          return; // 其他错误（如网络）保持缓存态，不强制重登
        }
      }
    }

    // 无有效 token：静默登录
    try {
      await get().login();
    } catch {
      // 静默登录失败，进入游客态
    }
  },

  logout: () => {
    clearAuth();
    set({ user: null, isPremium: false });
  }
}));
