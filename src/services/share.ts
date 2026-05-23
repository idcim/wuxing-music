import { USE_MOCK } from '@/constants/env';
import { request } from '@/services/api';
import { resolveUrl } from '@/utils/url';

// 生成小程序码，返回可访问的完整 URL（海报二维码用）。
// scene 可携带邀请人/礼物码等参数（<=32 字符）。
export async function getQrcode(scene = '', page = 'pages/home/index'): Promise<string> {
  if (USE_MOCK) return '';
  try {
    const res = await request<{ url: string; full_url?: string }>('/api/mp/qrcode', {
      method: 'POST',
      data: { scene, page }
    });
    return resolveUrl(res.url);
  } catch {
    return '';
  }
}
