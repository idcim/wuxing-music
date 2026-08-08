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
  // 「以中医五行学说为本，结合古传五音疗愈与现代频率疗法」是医疗宣称口吻，
  // 已按 docs/WUXING-REFERENCE.md 的主播提示词改成文化象征口径
  about_us:
    '五音、五行、五志、五脏，是东方传统文化里理解声音、身体、情绪和自然节律的一套象征系统。五行律音借这套系统，帮你更细腻地感受自己的情绪与节奏，并匹配今晚适合的声音。\n\n本应用提供的音乐为放松辅助，不替代医疗诊断与治疗。',
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
