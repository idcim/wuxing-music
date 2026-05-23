import Taro, { useShareAppMessage, useShareTimeline, useDidShow } from '@tarojs/taro';

interface ShareOpts {
  title: string;
  path?: string;          // 转发好友落地路径
  timelineTitle?: string; // 朋友圈标题（默认同 title）
}

/**
 * 统一开启「转发好友 + 分享到朋友圈」。
 * 小程序默认不显示这两个入口，需在页面 onShow 调 showShareMenu 显式开启，
 * 并注册 onShareAppMessage / onShareTimeline 才能真正分享。
 */
export function useShare(opts: () => ShareOpts) {
  // 进入页面时打开「···」菜单里的转发与朋友圈按钮
  useDidShow(() => {
    Taro.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    } as any);
  });

  useShareAppMessage(() => {
    const o = opts();
    return { title: o.title, path: o.path || '/pages/home/index' };
  });

  useShareTimeline(() => {
    const o = opts();
    return { title: o.timelineTitle || o.title, query: '' };
  });
}
