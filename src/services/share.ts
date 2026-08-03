import { USE_MOCK } from '@/constants/env';
import { request } from '@/services/api';
import { resolveUrl } from '@/utils/url';
import { isH5 } from '@/utils/platform';

// 生成海报二维码，返回可访问的完整 URL。
//
// 分端：小程序端用小程序码（scene 可携带邀请人/礼物码，<=32 字符）；
// H5 端用**普通链接二维码**——海报若印小程序码，H5 用户扫了会被拉去小程序，
// 整条纯 H5 的分享链路就断了。
export async function getQrcode(scene = '', page = 'pages/home/index'): Promise<string> {
  if (USE_MOCK) return '';
  try {
    if (isH5 && typeof window !== 'undefined') {
      const origin = window.location.origin + window.location.pathname;
      const q = scene ? `?${scene}` : '';
      const res = await request<{ url: string }>('/api/mp/qrcode/url', {
        method: 'POST',
        data: { url: `${origin}${q}#/${page}` }
      });
      return resolveUrl(res.url);
    }
    const res = await request<{ url: string; full_url?: string }>('/api/mp/qrcode', {
      method: 'POST',
      data: { scene, page }
    });
    return resolveUrl(res.url);
  } catch {
    return '';
  }
}
