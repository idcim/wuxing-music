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
  expiresIn: number;    // 秒
}

// 目录接口不下发音频地址（版权保护）：播放前用曲目 id 换短时效签名地址。
// fmt：PC 微信只信 16-bit PCM（传 wav），其余端优先 AAC 副本。
export async function getPlayUrl(trackId: number, fmt: 'aac' | 'wav'): Promise<PlayUrlResult> {
  return request<PlayUrlResult>(`/api/mp/tracks/${trackId}/play-url?fmt=${fmt}`);
}
