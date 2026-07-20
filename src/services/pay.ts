import Taro from '@tarojs/taro';
import { USE_MOCK } from '@/constants/env';
import { request } from '@/services/api';
import { isWeapp, isH5 } from '@/utils/platform';
import wechat from '@/services/wechat';
import type { PayParams } from '@/services/wechat/types';
import type { PlanId, Membership } from '@/types';

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

// 按端调起微信支付：
// - 小程序：Taro.requestPayment（下单参数直传）
// - H5（公众号内）：加载 JS-SDK，先 config 当前页再 chooseWXPay
// wechat 服务由 Taro 按端解析（weapp → index.weapp 桩，不含 jweixin；
// jweixin 仅 index.h5 在运行时以 <script> 注入），故不会打进小程序包。
async function invokePay(payParams: PayParams): Promise<void> {
  if (isH5) {
    // wechat 由 Taro 按端解析：h5 → index.h5（真实 JSSDK），weapp → index.weapp（桩）。
    await wechat.configJsSdk(typeof window !== 'undefined' ? window.location.href : '');
    await wechat.chooseWXPay(payParams);
    return;
  }
  await Taro.requestPayment({
    timeStamp: payParams.timeStamp,
    nonceStr: payParams.nonceStr,
    package: payParams.package,
    signType: payParams.signType,
    paySign: payParams.paySign
  });
}

// 识别用户主动取消：小程序 requestPayment 取消 errMsg 含 'cancel'；
// H5 chooseWXPay 取消无统一标识，尽量从 errMsg / message 中识别。
function isPayCancel(err: any): boolean {
  const msg = String(err?.errMsg || err?.message || '').toLowerCase();
  return msg.includes('cancel');
}

// 创建订单并拉起微信支付。成功后返回新会员信息（由调用方刷新 store）。
export async function purchasePlan(planId: PlanId): Promise<PayOutcome> {
  // 小程序 / H5（微信内）端内支付；其它端（未来 rn / iOS App 走 IAP）返回 platform。
  if (!isWeapp && !isH5) return { ok: false, reason: 'platform' };

  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 600));
    return { ok: true, membership: buildMembership(planId) };
  }

  try {
    const res = await request<CreateOrderResult>('/api/mp/pay/create-order', {
      method: 'POST',
      data: { planId, channel: isH5 ? 'h5' : 'weapp' }
    });

    // 开发期：后端直接开通，返回 dev_opened + 最新会员态，无需拉起支付
    if (res.dev_opened && res.membership) {
      return { ok: true, membership: res.membership };
    }

    // 生产：后端返回微信支付参数 → 分端拉起支付 → 取最新会员态
    if (res.payParams) {
      await invokePay(res.payParams);
      // 支付成功后会员由微信回调异步开通，可能略有延迟：短轮询取最新会员态
      const membership = await pollMembership(planId);
      return { ok: true, membership };
    }

    return { ok: false, reason: 'fail' };
  } catch (err: any) {
    if (isPayCancel(err)) return { ok: false, reason: 'cancel' };
    return { ok: false, reason: 'fail' };
  }
}

// ── 我的订单 ──
export interface MyOrder {
  orderNo: string;
  planId: PlanId;
  planName: string;
  amount: number;
  status: string;          // pending/paid/refunding/refunded/failed/closed
  isGift: boolean;
  giftCode: string;
  paidAt: string | null;
  createdAt: string | null;
}

export async function getMyOrders(): Promise<MyOrder[]> {
  if (USE_MOCK) return [];
  try {
    return await request<MyOrder[]>('/api/mp/orders');
  } catch {
    return [];
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
  if (!isWeapp && !isH5) return { ok: false, reason: 'platform' };

  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 600));
    return { ok: true, giftCode: 'GIFT-2026-DEMO-CODE', planName: PLAN_NAMES[planId] };
  }

  try {
    const res = await request<GiftOrderResult>('/api/mp/gift/create-order', {
      method: 'POST',
      data: { planId, channel: isH5 ? 'h5' : 'weapp' }
    });

    // 开发期：直接返回礼物码
    if (res.dev_opened && res.giftCode) {
      return { ok: true, giftCode: res.giftCode, planName: res.planName || PLAN_NAMES[planId] };
    }

    // 生产：分端拉起支付 → 轮询礼物码
    if (res.payParams && res.orderNo) {
      await invokePay(res.payParams);
      const r = await pollGiftCode(res.orderNo);
      if (r) return { ok: true, giftCode: r.giftCode, planName: r.planName };
      return { ok: false, reason: 'fail' };
    }

    return { ok: false, reason: 'fail' };
  } catch (err: any) {
    if (isPayCancel(err)) return { ok: false, reason: 'cancel' };
    return { ok: false, reason: 'fail' };
  }
}
