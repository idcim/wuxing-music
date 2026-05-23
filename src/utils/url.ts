import { API_BASE } from '@/constants/env';

// 把后端返回的相对路径（/uploads/xxx）补成完整 URL；
// 已是 http(s) 完整地址则原样返回；空值返回空串。
export function resolveUrl(url?: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const base = API_BASE.replace(/\/+$/, '');
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${base}${path}`;
}
