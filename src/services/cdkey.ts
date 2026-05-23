import type { CdkeyRedeemResult, PlanId } from '@/types';

// 开发期模拟兑换码（接入后端后改为 POST /api/cdkey/redeem）
const MOCK_KEYS: Record<string, { plan: string; days: number; type: PlanId }> = {
  'WUXING-2026-FREE-30D': { plan: '月悦体验卡', days: 30, type: 'month' },
  'MOON-LIGHT-VIP-365': { plan: '年藏会员卡', days: 365, type: 'year' },
  'ZEROER-GIFT-7DAY': { plan: '7日体验卡', days: 7, type: 'trial' }
};

export type RedeemOutcome =
  | { ok: true; data: CdkeyRedeemResult }
  | { ok: false; reason: 'invalid' | 'used' };

const usedKeys = new Set<string>();

// TODO: 接入后端 /api/cdkey/redeem，带 Bearer token，限频 5 次/分钟
export async function redeemCdkey(code: string): Promise<RedeemOutcome> {
  const key = code.trim().toUpperCase();
  await new Promise((r) => setTimeout(r, 600)); // 模拟网络延迟

  const found = MOCK_KEYS[key];
  if (!found) return { ok: false, reason: 'invalid' };
  if (usedKeys.has(key)) return { ok: false, reason: 'used' };

  usedKeys.add(key);
  const expireAt = new Date(Date.now() + found.days * 86400000).toISOString();
  return {
    ok: true,
    data: { plan: found.plan, type: found.type, days: found.days, expireAt }
  };
}
