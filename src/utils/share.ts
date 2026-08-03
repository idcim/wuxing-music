import Taro from '@tarojs/taro';
import { isWeapp, isH5, isInWeChat } from '@/utils/platform';
import wechat from '@/services/wechat';
import { getSiteInfo } from '@/services/site';
import { resolveUrl } from '@/utils/url';

// 缩略图用后台配置的站点 LOGO（设置中心可传）。取一次缓存住，
// 每个页面都去拉一遍站点信息没必要。未配 LOGO 时留空——微信会退回
// 页面里的首图，总比指向一个 404 强。
let thumbCache: string | null = null;
async function shareThumb(): Promise<string> {
  if (thumbCache !== null) return thumbCache;
  try {
    const site = await getSiteInfo();
    thumbCache = site.logo_url ? resolveUrl(site.logo_url) : '';
  } catch {
    thumbCache = '';
  }
  return thumbCache;
}

/**
 * 开启「···」菜单里的转发与分享到朋友圈按钮。
 *
 * 仅小程序端有此能力：showShareMenu 在 Taro H5 是 temporarilyNotSupport 存根，
 * 调用会抛异常（本页 useDidShow 里直接调，H5 每次进页面都报一次未捕获错误）。
 * H5 的分享要走公众号 JS-SDK 的 updateAppMessageShareData，属另一条路径。
 *
 * 注意：onShareAppMessage / onShareTimeline 必须在各页面里【直接】调用
 * useShareAppMessage / useShareTimeline，Taro 才能在编译期静态识别并注入页面，
 * 不能包在自定义 hook 里（会被静态分析忽略，导致朋友圈不可用）。
 */
export function openShareMenu() {
  if (!isWeapp) return;
  Taro.showShareMenu({
    withShareTicket: true,
    menus: ['shareAppMessage', 'shareTimeline']
  } as any);
}

/**
 * 设置 H5「···」菜单的转发文案。
 *
 * 小程序端由页面里的 useShareAppMessage / useShareTimeline 负责，本函数直接跳过；
 * H5 端这两个 hook 是空操作，不调 JS-SDK 的话从微信里转发出去只有一个裸标题、
 * 没有描述也没有缩略图。
 *
 * @param title 转发标题
 * @param desc  转发描述（朋友圈不显示描述，仅「发送给朋友」用）
 * @param path  落地路由（hash 路由，如 `/pages/home/index`）；默认当前页
 */
export function setH5Share(title: string, desc: string, path?: string): void {
  if (!isH5 || !isInWeChat || typeof window === 'undefined') return;
  const origin = window.location.origin + window.location.pathname;
  const link = path ? `${origin}#${path}` : window.location.href;
  shareThumb()
    .then((imgUrl) => wechat.updateShare({ title, desc, link, imgUrl }))
    .catch(() => { /* 分享设置失败不影响页面 */ });
}
