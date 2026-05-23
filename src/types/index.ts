// ─── 五行 ───────────────────────────────────────────
export type ElementId = '木' | '火' | '土' | '金' | '水';
export type NoteName = '角' | '徵' | '宫' | '商' | '羽';

export interface Track {
  id: number;
  title: string;
  duration: string;          // "MM:SS"
  durationSec: number;       // 用于实际播放
  hz: string;                // "324Hz" 或 "角调"
  tag: string;
  plays: string;             // "12.4k"
  audioUrl: string;          // CDN 地址
  coverUrl?: string;
  isPremium: boolean;
  previewSec?: number;       // 免费试听秒数
}

export interface WuxingElement {
  id: ElementId;
  en: string;
  icon: string;              // assets 下的图标资源名
  primary: string;
  accent: string;
  glow: string;
  bg: string;                // radial-gradient
  note: NoteName;
  notePinyin: string;
  organ: string;
  season: string;
  quality: string;
  desc: string;
  sleepTip: string;
  tracks: Track[];
}

// ─── 测评 ───────────────────────────────────────────
export type ElementScores = Record<ElementId, number>;

export interface QuizOption {
  text: string;
  score: Partial<ElementScores>;
}

export interface QuizQuestion {
  q: string;
  opts: QuizOption[];
}

// ─── 会员 / 用户 ─────────────────────────────────────
export type PlanId = 'free' | 'month' | 'year' | 'trial';

export interface Plan {
  id: PlanId;
  name: string;
  en: string;
  price: number;
  unit?: string;
  original?: string;
  badge?: string;
  featured?: boolean;
  limit?: boolean;
  features: string[];
}

export interface Membership {
  type: PlanId;
  name: string;
  startAt: string | null;
  expireAt: string | null;
  source: 'purchase' | 'cdkey' | 'gift' | null;
}

export interface User {
  id: string;
  openid: string;
  unionid?: string;
  nickname: string;
  avatar: string;
  element: ElementId | null;
  elementScores: ElementScores;
  quizCompletedAt: string | null;
  membership: Membership;
  createdAt: string;
}

// ─── CDKEY ──────────────────────────────────────────
export type CdkeyStatus = 'idle' | 'loading' | 'success' | 'error' | 'used';

export interface CdkeyRedeemResult {
  plan: string;
  type: PlanId;
  days: number;
  expireAt: string;
}
