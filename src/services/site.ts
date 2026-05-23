import { USE_MOCK } from '@/constants/env';
import { request } from '@/services/api';

export interface SiteInfo {
  site_name: string;
  logo_url: string;
  icp_no: string;
  contact_email: string;
  contact_phone: string;
  about_us: string;
  service_terms: string;
}

const MOCK_SITE: SiteInfo = {
  site_name: '五行律音',
  logo_url: '',
  icp_no: '',
  contact_email: 'hi@wuxingmusic.com',
  contact_phone: '',
  about_us:
    '五行律音以中医五行学说为本，结合古传五音疗愈与现代频率疗法，为你匹配专属安神助眠音律方案。\n\n本应用提供的音乐为放松辅助，不替代医疗诊断。',
  service_terms: ''
};

// 读取站点信息（关于我们等）。后端公开接口 GET /api/site/info，mock 下用本地文案。
export async function getSiteInfo(): Promise<SiteInfo> {
  if (USE_MOCK) return MOCK_SITE;
  try {
    return await request<SiteInfo>('/api/site/info', { auth: false });
  } catch {
    return MOCK_SITE;
  }
}
