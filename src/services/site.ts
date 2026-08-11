import { USE_MOCK } from '@/constants/env';
import { request } from '@/services/api';

export interface SiteInfo {
  site_name: string;
  site_slogan: string;   // 副标题：分享描述 / 海报品牌行 / 锁屏专辑名
  logo_url: string;
  icp_no: string;
  contact_email: string;
  contact_phone: string;
  about_us: string;
  service_terms: string;
}

// 后端未配 / 拉取失败时的兜底。品牌文案的最后一道防线——
// 页面里不要再各自硬编码「五行律音」，一律经 stores/site.ts 取。
export const DEFAULT_SITE: SiteInfo = {
  site_name: '五行律音',
  site_slogan: '按体质定制的助眠音律',
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

// 读取站点信息（品牌名 / 关于我们等）。后端公开接口 GET /api/site/info，mock 下用本地文案。
// 出参按 DEFAULT_SITE 补齐：后端老版本没有 site_slogan，缺键要能降级而不是渲染出 undefined。
export async function getSiteInfo(): Promise<SiteInfo> {
  if (USE_MOCK) return DEFAULT_SITE;
  try {
    const info = await request<Partial<SiteInfo>>('/api/site/info', { auth: false });
    return {
      ...DEFAULT_SITE,
      ...info,
      // 只有品牌名与副标题在留空时退回兜底——它们没有"空"这个合法状态，
      // 渲染出空白标题比显示默认名糟得多。其余项（联系方式/关于我们/备案号）
      // 留空就是"不展示"，照原样透传，不能拿默认值顶上去。
      site_name: info.site_name || DEFAULT_SITE.site_name,
      site_slogan: info.site_slogan || DEFAULT_SITE.site_slogan
    };
  } catch {
    return DEFAULT_SITE;
  }
}
