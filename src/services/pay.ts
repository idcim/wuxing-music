import Taro from '@tarojs/taro';
import { USE_MOCK } from '@/constants/env';
import { request } from '@/services/api';
import { isWeapp } from '@/utils/platform';
import type { PlanId, Membership } from '@/types';

// 微信统一下单返回的小程序支付参数（后端二次签名后下发）
interface PayParams {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: 'MD5' | 'HMAC-SHA256' | 'RSA';
  paySign: string;
}

interface CreateOrderResult {
  dev_opened?: boolean;       // 开发期后端直接开通
  orderNo?: string;
  membership?: Membership;
  payParams?: PayParams;      // 生产期微信支付参数
}

const PLAN_DAYS: Record<PlanId, number> = {
  free: 0,
  trial: 7,
  month: 30,
  year: 365
};

const PLAN_NAMES: Record<PlanId, string> = {
  free: '听闻',
  trial: '体验',
  month: '月悦',
  year: '年藏'
};

export type PayOutcome =
  | { ok: true; membership: Membership }
  | { ok: false; reason: 'cancel' | 'fail' | 'platform' };

function buildMembership(planId: PlanId): Membership {
  const days = PLAN_DAYS[planId];
  return {
    type: planId,
    name: PLAN_NAMES[planId],
    startAt: new Date().toISOString(),
    expireAt: new Date(Date.now() + days * 86400000).toISOString(),
    source: 'purchase'
  };
}

// 支付后会员由回调异步开通，短轮询拉取最新会员态（最多 ~5s）。
// 若轮询结束仍未生效，则回退用本地推算的会员信息，避免界面卡住。
async function pollMembership(planId: PlanId): Promise<Membership> {
  for (let i = 0; i < 5; i++) {
    try {
      const m = await request<Membership & { isPremium?: boolean }>('/api/mp/membership');
      if (m && m.type === planId) return m;
    } catch {
      // 忽略，继续重试
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return buildMembership(planId);
}

// 创建订单并拉起微信支付。成功后返回新会员信息（由调用方刷新 store）。
export async function purchasePlan(planId: PlanId): Promise<PayOutcome> {
  // iOS App 端订阅须走 Apple IAP，小程序端不受影响。此处仅小程序支付。
  if (!isWeapp) return { ok: false, reason: 'platform' };

  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 600));
    return { ok: true, membership: buildMembership(planId) };
  }

  try {
    const res = await request<CreateOrderResult>('/api/mp/pay/create-order', {
      method: 'POST',
      data: { planId }
    });

    // 开发期：后端直接开通，返回 dev_opened + 最新会员态，无需拉起支付
    if (res.dev_opened && res.membership) {
      return { ok: true, membership: res.membership };
    }

    // 生产：后端返回微信支付参数 → 拉起支付 → 取最新会员态
    if (res.payParams) {
      await Taro.requestPayment({
        timeStamp: res.payParams.timeStamp,
        nonceStr: res.payParams.nonceStr,
        package: res.payParams.package,
        signType: res.payParams.signType,
        paySign: res.payParams.paySign
      });
      // 支付成功后会员由微信回调异步开通，可能略有延迟：短轮询取最新会员态
      const membership = await pollMembership(planId);
      return { ok: true, membership };
    }

    return { ok: false, reason: 'fail' };
  } catch (err: any) {
    if (err?.errMsg && String(err.errMsg).includes('cancel')) {
      return { ok: false, reason: 'cancel' };
    }
    return { ok: false, reason: 'fail' };
  }
}

// ── 买卡送人（礼物码）──
interface GiftOrderResult {
  dev_opened?: boolean;
  orderNo?: string;
  giftCode?: string;
  planName?: string;
  payParams?: PayParams;
}

export type GiftOutcome =
  | { ok: true; giftCode: string; planName: string }
  | { ok: false; reason: 'cancel' | 'fail' | 'platform' };

// 轮询礼物码（支付回调异步生成）
async function pollGiftCode(orderNo: string): Promise<{ giftCode: string; planName: string } | null> {
  for (let i = 0; i < 6; i++) {
    try {
      const r = await request<{ status: string; giftCode: string; planName: string }>(
        `/api/mp/gift/code?orderNo=${orderNo}`
      );
      if (r.status === 'paid' && r.giftCode) {
        return { giftCode: r.giftCode, planName: r.planName };
      }
    } catch {
      // 忽略
    }
    await new Promise((rs) => setTimeout(rs, 1000));
  }
  return null;
}

// 购买礼物卡：成功返回礼物码（调用方用海报展示分享）。
export async function purchaseGift(planId: PlanId): Promise<GiftOutcome> {
  if (!isWeapp) return { ok: false, reason: 'platform' };

  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 600));
    return { ok: true, giftCode: 'GIFT-2026-DEMO-CODE', planName: PLAN_NAMES[planId] };
  }

  try {
    const res = await request<GiftOrderResult>('/api/mp/gift/create-order', {
      method: 'POST',
      data: { planId }
    });

    // 开发期：直接返回礼物码
    if (res.dev_opened && res.giftCode) {
      return { ok: true, giftCode: res.giftCode, planName: res.planName || PLAN_NAMES[planId] };
    }

    // 生产：拉起支付 → 轮询礼物码
    if (res.payParams && res.orderNo) {
      await Taro.requestPayment({
        timeStamp: res.payParams.timeStamp,
        nonceStr: res.payParams.nonceStr,
        package: res.payParams.package,
        signType: res.payParams.signType,
        paySign: res.payParams.paySign
      });
      const r = await pollGiftCode(res.orderNo);
      if (r) return { ok: true, giftCode: r.giftCode, planName: r.planName };
      return { ok: false, reason: 'fail' };
    }

    return { ok: false, reason: 'fail' };
  } catch (err: any) {
    if (err?.errMsg && String(err.errMsg).includes('cancel')) {
      return { ok: false, reason: 'cancel' };
    }
    return { ok: false, reason: 'fail' };
  }
}
