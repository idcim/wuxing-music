import { create } from 'zustand';
import { request } from './api';
import { USE_MOCK } from '@/constants/env';

export const COMMERCE = '/api/mp/v2';
export const coursePath = '/packages/courses';
export const shopPath = '/packages/shop';
export type Entry = Record<string, any>;
export const money = (fen: number) => `¥${((fen || 0) / 100).toFixed(2)}`;

export async function commerceApi<T = any>(path: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', data?: Record<string, unknown>): Promise<T> {
  if (USE_MOCK) {
    if (path === '/config') return { courses_visible: true, shop_visible: true, courses_sale: false, shop_sale: false, capabilities: {}, customer_service: '' } as T;
    if (method !== 'GET') throw new Error('演示模式不执行真实交易，请连接测试后端');
    if (path.startsWith('/catalog/') || path.startsWith('/orders?')) return { items: [], total: 0, categories: [] } as T;
    return [] as T;
  }
  return request<T>(COMMERCE + path, { method, data });
}

export const useCommerce = create<{ config: Entry; load: () => Promise<void> }>((set) => ({
  config: {},
  load: async () => { try { set({ config: await commerceApi('/config') }); } catch { /* 保留已加载的入口配置，服务端仍逐次校验开关。 */ } },
}));
