import Taro from '@tarojs/taro';
import { USE_MOCK } from '@/constants/env';
import { request, ApiError } from '@/services/api';
import { storage, STORAGE_KEYS } from '@/services/storage';
import { isH5 } from '@/utils/platform';
import type { AgentDownline, AgentMe, CommissionItem, WithdrawalItem } from '@/types';

/**
 * 代理分成。**模块默认关闭**，关闭时后端所有 /api/mp/agent/* 都回 404，
 * 本文件一律把 404 当作「没这功能」处理并静默返回空——不弹错、不留痕迹。
 */

const NOT_AGENT: AgentMe = { isAgent: false };

// mock 下的假代理，方便无后端时把页面跑通
const MOCK_ME: AgentMe = {
  isAgent: true,
  agent: { id: 1, code: 'A8K3N9', name: '城东琴行', type: 'store', effectiveRate: 0.2, status: 'active' },
  upline: null,
  balance: { available: 64.8, frozen: 21.6, withdrawing: 0, paid: 129.6 },
  month: { count: 12, amount: 216, gmv: 1080 },
  minWithdraw: 10,
  freezeDays: 7
};

/** 模块未开启（404）时静默降级，其余错误照常抛出。 */
function isDisabled(e: unknown): boolean {
  return e instanceof ApiError && e.code === 404;
}

// ── 推广码采集：小程序码 scene / H5 链接的 ?a= ──

/**
 * 从启动参数里取推广码并暂存。此时可能还没登录，所以先落本地，登录后再提交。
 *
 * 小程序的 scene 是**被 encodeURIComponent 过的**，必须先解码再解析，
 * 否则 `a=XXXX` 会变成 `a%3DXXXX` 取不到值。
 */
export function captureAgentCode(): void {
  let raw = '';
  try {
    if (isH5) {
      if (typeof window === 'undefined') return;
      raw = window.location.search || '';
      // hash 路由下参数可能落在 hash 里（.../?a=X#/pages/...  或  .../#/pages/...?a=X）
      if (!raw.includes('a=') && window.location.hash.includes('?')) {
        raw = window.location.hash.slice(window.location.hash.indexOf('?'));
      }
    } else {
      const q = (Taro.getLaunchOptionsSync?.()?.query || {}) as Record<string, string>;
      // 扫小程序码时参数在 scene 里；普通带参跳转则直接是 query.a
      raw = q.scene ? decodeURIComponent(q.scene) : (q.a ? `a=${q.a}` : '');
    }
  } catch {
    return;
  }
  const m = /(?:^|[?&])a=([A-Za-z0-9]{4,16})/.exec(raw);
  if (m) storage.set(STORAGE_KEYS.PENDING_AGENT, m[1].toUpperCase());
}

/**
 * 把暂存的推广码提交绑定。登录成功后调用；无待绑码则什么都不做。
 *
 * 首次扫码永久绑定：已绑过的用户再扫别人的码，后端返回 bound=false，
 * 这里同样清掉本地待绑码——**不提示**，对用户来说这不是错误，弹窗只是噪音。
 */
export async function bindPendingAgent(): Promise<string> {
  const code = storage.get<string>(STORAGE_KEYS.PENDING_AGENT);
  if (!code) return '';
  if (USE_MOCK) {
    storage.remove(STORAGE_KEYS.PENDING_AGENT);
    return '';
  }
  try {
    const res = await request<{ bound: boolean; reason: string; agentName?: string }>(
      '/api/mp/agent/bind',
      { method: 'POST', data: { code } }
    );
    storage.remove(STORAGE_KEYS.PENDING_AGENT);
    return res.bound ? (res.agentName || '') : '';
  } catch (e) {
    // 模块未开启：码留着也没用，清掉免得日后误绑
    if (isDisabled(e)) storage.remove(STORAGE_KEYS.PENDING_AGENT);
    // 其它错误（如未登录）保留待绑码，下次登录再试
    return '';
  }
}

// ── 代理中心 ──

/** 我的代理身份与业绩。非代理 / 模块未开启都返回 isAgent:false。 */
export async function getAgentMe(): Promise<AgentMe> {
  if (USE_MOCK) return MOCK_ME;
  try {
    return await request<AgentMe>('/api/mp/agent/me');
  } catch (e) {
    if (isDisabled(e)) return NOT_AGENT;
    throw e;
  }
}

/** 我的下级：直接下级代理 + 推广用户数。只有一层——下级的下级与我无关。 */
export async function getDownline(): Promise<AgentDownline> {
  if (USE_MOCK) {
    return {
      subAgents: [
        { id: 2, name: '推手小李', code: 'B7X2M4', type: 'promoter', status: 'active', userCount: 8, contributed: 12.8, createdAt: '2026-07-10T10:00:00' }
      ],
      subAgentCount: 1,
      userCount: 23
    };
  }
  try {
    return await request<AgentDownline>('/api/mp/agent/downline');
  } catch (e) {
    if (isDisabled(e)) return { subAgents: [], subAgentCount: 0, userCount: 0 };
    throw e;
  }
}

export async function getCommissions(page = 1, size = 20): Promise<{ total: number; items: CommissionItem[] }> {
  if (USE_MOCK) {
    return {
      total: 2,
      items: [
        { id: 1, amount: 2.7, orderAmount: 18, level: 1, baseAmount: 3.6, rate: 0.2, status: 'available', availableAt: null, createdAt: '2026-08-01T10:00:00' },
        { id: 2, amount: 6.4, orderAmount: 128, level: 2, baseAmount: 25.6, sourceAgentName: '推手小李', rate: 0.25, status: 'pending', availableAt: '2026-08-10T10:00:00', createdAt: '2026-08-03T09:00:00' }
      ]
    };
  }
  try {
    return await request<{ total: number; items: CommissionItem[] }>(
      `/api/mp/agent/commissions?page=${page}&size=${size}`
    );
  } catch (e) {
    if (isDisabled(e)) return { total: 0, items: [] };
    throw e;
  }
}

export async function getWithdrawals(): Promise<WithdrawalItem[]> {
  if (USE_MOCK) {
    return [{ id: 1, amount: 129.6, status: 'paid', paidAt: '2026-07-20T12:00:00', createdAt: '2026-07-19T12:00:00' }];
  }
  try {
    return await request<WithdrawalItem[]>('/api/mp/agent/withdrawals');
  } catch (e) {
    if (isDisabled(e)) return [];
    throw e;
  }
}

/** 发起提现。金额以服务端重算的余额为准，这里传的只是意向值。 */
export async function requestWithdraw(amount: number): Promise<{ id: number; amount: number }> {
  if (USE_MOCK) return { id: 1, amount };
  return request<{ id: number; amount: number }>('/api/mp/agent/withdraw', {
    method: 'POST',
    data: { amount }
  });
}
