import { USE_MOCK } from '@/constants/env';
import { request, ApiError } from '@/services/api';
import type { CdkeyRedeemResult, PlanId } from '@/types';

export type RedeemOutcome =
  | { ok: true; data: CdkeyRedeemResult }
  // message 是后端给的具体原因（已过期 / 不可用 / 兑换过于频繁…），
  // 界面优先展示它，避免把「已过期」「被限流」「未登录」一律说成「兑换码无效」。
  | { ok: false; reason: 'invalid' | 'used' | 'auth'; message?: string };

// ── mock ──
const MOCK_KEYS: Record<string, { plan: string; days: number; type: PlanId }> = {
  'WUXING-2026-FREE-30D': { plan: '月悦体验卡', days: 30, type: 'month' },
  'MOON-LIGHT-VIP-365': { plan: '年藏会员卡', days: 365, type: 'year' },
  'ZEROER-GIFT-7DAY': { plan: '7日体验卡', days: 7, type: 'trial' }
};
const usedKeys = new Set<string>();

async function redeemMock(code: string): Promise<RedeemOutcome> {
  const key = code.trim().toUpperCase();
  await new Promise((r) => setTimeout(r, 600));
  const found = MOCK_KEYS[key];
  if (!found) return { ok: false, reason: 'invalid' };
  if (usedKeys.has(key)) return { ok: false, reason: 'used' };
  usedKeys.add(key);
  const expireAt = new Date(Date.now() + found.days * 86400000).toISOString();
  return { ok: true, data: { plan: found.plan, type: found.type, days: found.days, expireAt } };
}

// 兑换码：真实调 /api/mp/cdkey/redeem，mock 下走本地。
export async function redeemCdkey(code: string): Promise<RedeemOutcome> {
  if (USE_MOCK) return redeemMock(code);

  try {
    const data = await request<CdkeyRedeemResult>('/api/mp/cdkey/redeem', {
      method: 'POST',
      data: { code: code.trim().toUpperCase() }
    });
    return { ok: true, data };
  } catch (err) {
    const code = err instanceof ApiError ? err.code : 0;
    const msg = err instanceof ApiError ? err.message : '';
    if (code === 401) return { ok: false, reason: 'auth', message: '请先登录后再兑换' };
    if (msg.includes('已被使用')) return { ok: false, reason: 'used', message: msg };
    return { ok: false, reason: 'invalid', message: msg };
  }
}
