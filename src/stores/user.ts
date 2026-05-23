import { create } from 'zustand';
import type { User, Membership, ElementId, ElementScores } from '@/types';
import { storage, STORAGE_KEYS } from '@/services/storage';
import { wxLogin, fetchProfile, clearAuth, getToken } from '@/services/auth';

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
  login: () => Promise<User>;
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

  // 启动时优先用缓存的登录态，无 token 时静默登录
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
      } catch {
        // 拉取失败保持缓存态
      }
    } else {
      try {
        await get().login();
      } catch {
        // 静默登录失败，进入游客态
      }
    }
  },

  logout: () => {
    clearAuth();
    set({ user: null, isPremium: false });
  }
}));
