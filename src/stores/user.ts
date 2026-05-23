import { create } from 'zustand';
import type { User, Membership, ElementId, ElementScores } from '@/types';
import { storage, STORAGE_KEYS } from '@/services/storage';

interface UserStore {
  user: User | null;
  element: ElementId | null;
  scores: ElementScores | null;
  isPremium: boolean;
  setUser: (u: User) => void;
  setElement: (el: ElementId, scores: ElementScores) => void;
  updateMembership: (m: Membership) => void;
  logout: () => void;
}

function computePremium(m?: Membership | null): boolean {
  if (!m || m.type === 'free' || !m.expireAt) return false;
  return new Date(m.expireAt).getTime() > Date.now();
}

export const useUserStore = create<UserStore>((set) => ({
  user: null,
  element: storage.get<ElementId>(STORAGE_KEYS.ELEMENT),
  scores: storage.get<ElementScores>(STORAGE_KEYS.SCORES),
  isPremium: false,

  setUser: (user) =>
    set({ user, isPremium: computePremium(user.membership) }),

  setElement: (element, scores) => {
    storage.set(STORAGE_KEYS.ELEMENT, element);
    storage.set(STORAGE_KEYS.SCORES, scores);
    set({ element, scores });
  },

  updateMembership: (membership) =>
    set((state) => ({
      user: state.user ? { ...state.user, membership } : null,
      isPremium: computePremium(membership)
    })),

  logout: () => {
    storage.remove(STORAGE_KEYS.USER);
    set({ user: null, isPremium: false });
  }
}));
