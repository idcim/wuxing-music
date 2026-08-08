// ─── 五行 ───────────────────────────────────────────
export type ElementId = '木' | '火' | '土' | '金' | '水';
export type NoteName = '角' | '徵' | '宫' | '商' | '羽';

export interface Track {
  id: number;
  elementId?: ElementId;     // 所属五行。播放器/迷你条据此取音名与配色（后端 /elements 下发）
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

/**
 * 五行的文化对照维度（docs/WUXING-REFERENCE.md 的「五行总对应表」）。
 * 只做展示与文案取材，不进渲染主链路，所以后端存一个 JSON 列而不是三十多个字段。
 * 全部可选：后台是自由编辑的 JSON，缺键要能正常降级。
 */
export interface ElementMeta {
  temperament?: string;  // 基本气质「生发、舒展、条达」
  direction?: string;    // 方位
  climate?: string;      // 气候
  phase?: string;        // 五化
  colorName?: string;    // 五色，文化字段，≠ UI 主色（见参考文档 5.3）
  taste?: string;        // 五味
  smell?: string;        // 五臭
  notation?: string;     // 简谱近似「3 / mi」
  mode?: string;         // 五声调式
  musicMood?: string;    // 音乐气质
  keywords?: string;     // 适合内容关键词
  organZang?: string;    // 五脏（单字）
  organFu?: string;      // 五腑（单字）
  sense?: string;        // 五官 / 五窍
  tissue?: string;       // 五体
  bloom?: string;        // 五华
  fluid?: string;        // 五液
  emotion?: string;      // 五志
  spirit?: string;       // 五神
  voice?: string;        // 人声五声
  imbalance?: string;    // 情绪失衡表现（测评题干取材）
  transform?: string;    // 情绪转化方向
  virtue?: string;       // 五常
  virtueFeel?: string;   // 五德感受
  beast?: string;        // 五方神兽
  star?: string;         // 五星
  gan?: string;          // 天干
  zhi?: string;          // 地支
  gua?: string;          // 八卦
  timeFeel?: string;     // 时间感
  spaceFeel?: string;    // 空间感
  imagery?: string;      // 适合画面
  mnemonic?: string;     // 一句话记忆口诀
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
  meta?: ElementMeta;        // 文化对照维度，后端 /api/mp/elements 下发
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

// ─── 代理分成 ────────────────────────────────────────
// 整个模块默认关闭：关闭时 /api/mp/agent/* 一律 404，前端不渲染任何入口。
export type CommissionStatus = 'pending' | 'available' | 'withdrawing' | 'paid' | 'void';
export type WithdrawalStatus = 'pending' | 'approved' | 'paid' | 'rejected' | 'failed';

export interface AgentBalance {
  available: number;   // 可提现
  frozen: number;      // 冻结中（未过冻结期）
  withdrawing: number; // 提现处理中
  paid: number;        // 已到账
}

export interface AgentInfo {
  id: number;
  code: string;                    // 推广码，进海报二维码的 a=<code>
  name: string;
  type: 'store' | 'promoter';
  effectiveRate: number | null;    // 实际生效的直推比例（已把「跟随默认」解析掉）
  effectiveRate2: number | null;   // 作为上级时，下级每单我额外拿订单额的多少
  status: string;
}

export interface AgentMe {
  isAgent: boolean;
  agent?: AgentInfo;
  // 不下发上级信息：加法模型下上级那份是平台额外出的，代理拿满自己的比例，
  // 没有「怎么少给了」要解释——提一嘴反而让人以为被抽了。
  balance?: AgentBalance;
  month?: { count: number; amount: number; gmv: number };
  minWithdraw?: number;
  freezeDays?: number;
}

export interface SubAgent {
  id: number;
  name: string;
  code: string;
  type: 'store' | 'promoter';
  status: string;
  userCount: number;
  contributed: number;   // 该下级为我带来的加成
  createdAt: string | null;
}

export interface AgentDownline {
  subAgents: SubAgent[];
  subAgentCount: number;
  userCount: number;
}

export interface CommissionItem {
  id: number;
  amount: number;
  orderAmount: number;
  // 1=直推（订单额 × 我的比例，恒定拿满），2=下级成交给我的加成（订单额 × 我的加成比例）
  level: number;
  sourceAgentName?: string;
  rate: number;
  status: CommissionStatus;
  availableAt: string | null;
  createdAt: string | null;
}

export interface WithdrawalItem {
  id: number;
  amount: number;
  status: WithdrawalStatus;
  failReason?: string;
  paidAt: string | null;
  createdAt: string | null;
}

// ─── CDKEY ──────────────────────────────────────────
export type CdkeyStatus = 'idle' | 'loading' | 'success' | 'error' | 'used';

export interface CdkeyRedeemResult {
  plan: string;
  type: PlanId;
  days: number;
  expireAt: string;
}
