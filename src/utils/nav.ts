import type { CSSProperties } from 'react';
import Taro from '@tarojs/taro';
import { isH5 } from './platform';
import { rpx } from './unit';

// 自定义导航页的安全顶部高度（状态栏 + 胶囊按钮区域），单位 px。
// 用于避让微信右上角胶囊按钮，防止顶部内容被遮挡。
let cached = 0;

export function getNavTop(): number {
  if (cached) return cached;
  try {
    const sys = Taro.getWindowInfo
      ? Taro.getWindowInfo()
      : Taro.getSystemInfoSync();
    const statusBar = sys.statusBarHeight || 20;
    // 胶囊按钮位置（H5 等不支持时回退）
    let menuBottom = statusBar + 44;
    if (Taro.getMenuButtonBoundingClientRect) {
      const rect = Taro.getMenuButtonBoundingClientRect();
      if (rect && rect.bottom) menuBottom = rect.bottom + 8;
    }
    cached = menuBottom;
  } catch {
    cached = 64; // 兜底
  }
  return cached;
}

/**
 * 自定义导航页头部的顶部内边距。
 *
 * 小程序：必须避让右上角胶囊按钮，用 getNavTop() 实测值。
 *
 * H5：微信的标题栏在 webview 之外，页面里**没有**胶囊按钮需要避让，
 * 照搬 getNavTop() 会白白空出 64px——H5 下 `statusBarHeight` 是 NaN
 * （taro-h5 api/base/system.js），且 `getMenuButtonBoundingClientRect` 是
 * temporarilyNotSupport 存根（存在但不可用，还会 console.warn），
 * 两条路都落到兜底的 20+44。因此 H5 直接按设计稿留 88rpx，
 * 与 userinfo / explore / member / profile 各页样式表里的口径一致。
 */
export function navTopStyle(): CSSProperties {
  if (isH5) return { paddingTop: rpx(88) };
  return { paddingTop: `${getNavTop()}px` };
}

/**
 * 安全返回：页面栈里没有上一页时兜底回首页，避免把用户困在页面里。
 *
 * H5 可由分享链接 / 刷新直接进到任意二级页（hash 路由），此时栈里只有当前页，
 * 裸 `Taro.navigateBack()` 会静默失败——返回箭头点了没反应。
 * 也不能只靠 catch：Taro H5 的 navigateBack 不保证 reject。
 */
export function goBack(fallback = '/pages/home/index'): void {
  if (Taro.getCurrentPages().length > 1) {
    Taro.navigateBack();
    return;
  }
  Taro.reLaunch({ url: fallback });
}
