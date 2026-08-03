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

// 生日换算出的农历信息（由后端算好下发，前端不引农历库）
export interface LunarInfo {
  date: string;              // 「丙子年二月廿五」，闰月自带「闰」前缀
  shengXiao: string;         // 生肖，春节口径
  dayGan: string;            // 日柱天干
  element: ElementId | '';   // 日主五行（本命五行），值域与 ElementId 一致
  eightChar: string | null;  // 四柱「丙子 壬辰 己卯 丙子」，未填时辰为 null
}

export interface User {
  id: string;
  openid: string;
  unionid?: string;
  phone?: string;
  hasPassword?: boolean;     // 是否已设置登录密码（决定「手机号 + 密码」登录可用与否）
  birthday?: string | null;  // 公历生日 "1996-04-12"
  birthHour?: number | null; // 出生钟点 0-23，null 表示未知时辰
  lunar?: LunarInfo | null;  // 后端据 birthday 换算，无生日则为 null
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
