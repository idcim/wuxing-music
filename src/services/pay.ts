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

interface CreateOrderResult {
  dev_opened?: boolean;       // 开发期后端直接开通
  membership?: Membership;
  pay?: PayParams;            // 生产期微信支付参数
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
    const res = await request<CreateOrderResult>('/api/mp/pay/create-order', {
      method: 'POST',
      data: { planId }
    });

    // 开发期：后端直接开通，返回 dev_opened + 最新会员态，无需拉起支付
    if (res.dev_opened && res.membership) {
      return { ok: true, membership: res.membership };
    }

    // 生产：后端返回微信支付参数 → 拉起支付 → 取最新会员态
    if (res.pay) {
      await Taro.requestPayment({
        timeStamp: res.pay.timeStamp,
        nonceStr: res.pay.nonceStr,
        package: res.pay.package,
        signType: res.pay.signType,
        paySign: res.pay.paySign
      });
      const membership = await request<Membership>('/api/mp/membership');
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
