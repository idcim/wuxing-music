import { USE_MOCK } from '@/constants/env';
import { request } from '@/services/api';
import { ELEMENT_LIST } from '@/constants/wuxing';
import type { WuxingElement } from '@/types';

// 拉取五行+曲目。mock 下用本地常量；真实从 /api/mp/elements。
export async function fetchElements(): Promise<WuxingElement[]> {
  if (USE_MOCK) return ELEMENT_LIST;
  return request<WuxingElement[]>('/api/mp/elements', { auth: false });
}

export interface PlayUrlResult {
  url: string;          // 短时效签名播放地址（相对路径，resolveUrl 补全）
  preview: boolean;     // true = 试听剪辑（会员曲目的非会员播放）
  format?: string;      // 实际命中的格式：prev / wav16 / aac / master
  expiresIn: number;    // 秒
}

// 目录接口不下发音频地址（版权保护）：播放前用曲目 id 换短时效签名地址。
// fmt 是格式偏好：默认优先已有 AAC，无 AAC 时直接回退母版；wav 用于解码失败重试。
export async function getPlayUrl(trackId: number, fmt: 'aac' | 'wav'): Promise<PlayUrlResult> {
  return request<PlayUrlResult>(`/api/mp/tracks/${trackId}/play-url?fmt=${fmt}`);
}
