import Taro from '@tarojs/taro';
import { USE_MOCK } from '@/constants/env';
import { request } from '@/services/api';
import { isWeapp } from '@/utils/platform';
import type { PlanId, Membership } from '@/types';

// 微信统一下单返回的小程序支付参数
interface PayParams {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: 'MD5' | 'HMAC-SHA256' | 'RSA';
  paySign: string;
  orderId: string;
}

interface OrderResult {
  pay: PayParams;
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

// 创建订单并拉起微信支付。成功后返回新会员信息（由调用方刷新 store）。
export async function purchasePlan(planId: PlanId): Promise<PayOutcome> {
  // iOS App 端订阅须走 Apple IAP，小程序端不受影响。此处仅小程序支付。
  if (!isWeapp) return { ok: false, reason: 'platform' };

  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 600));
    return { ok: true, membership: buildMembership(planId) };
  }

  try {
    const { pay } = await request<OrderResult>('/api/pay/create-order', {
      method: 'POST',
      data: { planId }
    });
    await Taro.requestPayment({
      timeStamp: pay.timeStamp,
      nonceStr: pay.nonceStr,
      package: pay.package,
      signType: pay.signType,
      paySign: pay.paySign
    });
    // 支付成功，向后端确认订单状态后由 profile/membership 接口取最新会员态
    const membership = await request<Membership>('/api/user/membership');
    return { ok: true, membership };
  } catch (err: any) {
    if (err?.errMsg && String(err.errMsg).includes('cancel')) {
      return { ok: false, reason: 'cancel' };
    }
    return { ok: false, reason: 'fail' };
  }
}
