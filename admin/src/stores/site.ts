import { defineStore } from 'pinia';
import { getSiteInfo } from '@/api';

const DEFAULT_NAME = '五行律音';
const CACHE_KEY = 'admin_site_name';

/**
 * 站点品牌信息（后台「设置中心 → 站点信息」的项目名称）。
 *
 * 侧边栏、登录页标题、浏览器页签都取这里，与小程序/H5 用的是同一份 site_config。
 * 走**公开接口** `/api/site/info`：登录页在拿到 token 之前就要显示品牌名，
 * 用 `/api/admin/settings/site` 会 401。
 *
 * 名字缓存在 localStorage，刷新时先用缓存渲染，免得每次都闪一下默认名。
 */
export const useSiteStore = defineStore('site', {
  state: () => ({
    name: localStorage.getItem(CACHE_KEY) || DEFAULT_NAME
  }),

  actions: {
    applyTitle() {
      document.title = `${this.name} · 管理后台`;
    },

    async load() {
      this.applyTitle();   // 先用缓存值，别等网络
      try {
        const d = await getSiteInfo();
        const name = d?.site_name || DEFAULT_NAME;
        this.name = name;
        localStorage.setItem(CACHE_KEY, name);
        this.applyTitle();
      } catch {
        // 后端不可达时保留缓存/默认名，不影响登录
      }
    }
  }
});
