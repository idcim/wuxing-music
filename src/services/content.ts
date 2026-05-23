import { USE_MOCK } from '@/constants/env';
import { request } from '@/services/api';
import { ELEMENT_LIST } from '@/constants/wuxing';
import type { WuxingElement } from '@/types';

// 拉取五行+曲目。mock 下用本地常量；真实从 /api/mp/elements。
export async function fetchElements(): Promise<WuxingElement[]> {
  if (USE_MOCK) return ELEMENT_LIST;
  return request<WuxingElement[]>('/api/mp/elements', { auth: false });
}
