import Taro from '@tarojs/taro';
import { USE_MOCK } from '@/constants/env';
import { request, ApiError } from '@/services/api';
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
  // auth：未登录 / H5 未走微信授权（后端「请先微信登录」）——可引导，不该说成「支付失败」
  // pending：钱已付但回调还没把会员开出来，属「稍后自动生效」，不能当失败也不能当成功
  // message：后端给的具体原因，界面优先展示
  | { ok: false; reason: 'cancel' | 'fail' | 'platform' | 'auth' | 'pending'; message?: string };

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

// 支付后会员由微信回调异步开通，短轮询拉取最新会员态（最多 ~8s）。
// 超时返回 null，**绝不本地推算一个会员态冒充成功**——回调可能压根没到
// （验签失败、回调地址不通、金额不符），伪造出来的「开通成功」会让用户
// 以为已生效，直到下一次 fetchProfile 才被打回原形。
async function pollMembership(planId: PlanId): Promise<Membership | null> {
  for (let i = 0; i < 8; i++) {
    try {
      const m = await request<Membership & { isPremium?: boolean }>('/api/mp/membership');
      if (m && m.type === planId) return m;
    } catch {
      // 忽略，继续重试
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
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

// 把下单/支付异常翻译成可展示的结果。
// 未登录（401）与 H5 未走微信授权（后端 400「请先微信登录」，见 mp.py::_resolve_pay_payer）
// 都是可引导的登录问题——之前一律落到 reason:'fail'，界面提示「支付失败，请重试」，
// 而用户无论重试多少次都不会成功。
function payFailure(err: any): { ok: false; reason: 'cancel' | 'fail' | 'auth'; message?: string } {
  if (isPayCancel(err)) return { ok: false, reason: 'cancel' };
  const code = err instanceof ApiError ? err.code : 0;
  const msg = err instanceof ApiError ? err.message : '';
  if (code === 401 || msg.includes('请先微信登录') || msg.includes('请先登录')) {
    return { ok: false, reason: 'auth', message: msg || '请先登录后再购买' };
  }
  return { ok: false, reason: 'fail', message: msg };
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
      if (membership) return { ok: true, membership };
      return {
        ok: false,
        reason: 'pending',
        message: '支付已完成，会员开通稍有延迟，请稍后在「我的」查看'
      };
    }

    return { ok: false, reason: 'fail' };
  } catch (err: any) {
    return payFailure(err);
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
  // 不再 catch 成 []：调用方要能区分「真的没有订单」和「401 / 断网 / 后端出错」，
  // 否则一律渲染成「还没有订单记录」，用户会以为自己没买过。
  return request<MyOrder[]>('/api/mp/orders');
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
  // auth：未登录 / H5 未走微信授权（后端「请先微信登录」）——可引导，不该说成「支付失败」
  // pending：钱已付但礼物码还没生成，可去「我的订单」回看，不是失败
  // message：后端给的具体原因，界面优先展示
  | { ok: false; reason: 'cancel' | 'fail' | 'platform' | 'auth' | 'pending'; message?: string };

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
      return {
        ok: false,
        reason: 'pending',
        message: '支付已完成，礼物码生成稍有延迟，可稍后在「我的订单」查看'
      };
    }

    return { ok: false, reason: 'fail' };
  } catch (err: any) {
    return payFailure(err);
  }
}
