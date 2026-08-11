import { create } from 'zustand';
import type { SiteInfo } from '@/services/site';
import { getSiteInfo, DEFAULT_SITE } from '@/services/site';
import { storage, STORAGE_KEYS } from '@/services/storage';
import { isH5 } from '@/utils/platform';

/**
 * 站点品牌信息（后台「设置中心 → 站点信息」）。
 *
 * 全端的品牌名与副标题都从这里取，页面里不要再硬编码「五行律音」——
 * 后台改名后 H5/后台立刻生效，已发布的小程序旧包也跟着变（同 stores/content 的路子）。
 *
 * 冷启动顺序：本地缓存 → 兜底常量，`hydrate()` 拉到后端值再覆盖并回写缓存。
 * 不这么做的话每次冷启动都会先闪一下默认名再跳成真名。
 */
interface SiteStore {
  site: SiteInfo;
  hydrate: () => Promise<void>;
}

// 缓存可能是旧版本写的（缺 site_slogan），按兜底补齐再用
function cached(): SiteInfo {
  const c = storage.get<Partial<SiteInfo>>(STORAGE_KEYS.SITE);
  return c ? { ...DEFAULT_SITE, ...c } : DEFAULT_SITE;
}

export const useSiteStore = create<SiteStore>((set, get) => ({
  site: cached(),

  hydrate: async () => {
    applyDocTitle(get().site.site_name);   // 先用缓存值刷标题，别等网络
    try {
      const site = await getSiteInfo();
      storage.set(STORAGE_KEYS.SITE, site);
      set({ site });
      applyDocTitle(site.site_name);
    } catch {
      // 拉取失败保留缓存/兜底
    }
  }
}));

/**
 * 品牌名。给非 React 上下文用的同步取值——`onShareAppMessage` 必须同步返回，
 * `services/audio`（锁屏元数据）与 `services/poster/draw`（画布）也不在组件里，
 * 拿不到 hook。组件内优先用 `useSiteStore((s) => s.site.site_name)` 以便响应更新。
 */
export function siteName(): string {
  return useSiteStore.getState().site.site_name || DEFAULT_SITE.site_name;
}

export function siteSlogan(): string {
  return useSiteStore.getState().site.site_slogan || DEFAULT_SITE.site_slogan;
}

/** 「五行律音 · 按体质定制的助眠音律」——分享标题与海报品牌行的统一写法 */
export function brandLine(): string {
  return `${siteName()} · ${siteSlogan()}`;
}

// H5 浏览器页签。小程序各页都是 navigationStyle: custom，原生标题栏根本不渲染，
// setNavigationBarTitle 在这种页面上无效，所以这里只处理 H5。
function applyDocTitle(name: string): void {
  if (!isH5 || typeof document === 'undefined' || !name) return;
  document.title = name;
}
