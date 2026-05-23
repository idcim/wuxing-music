import Taro from '@tarojs/taro';

/**
 * 开启「···」菜单里的转发与分享到朋友圈按钮。
 * 注意：onShareAppMessage / onShareTimeline 必须在各页面里【直接】调用
 * useShareAppMessage / useShareTimeline，Taro 才能在编译期静态识别并注入页面，
 * 不能包在自定义 hook 里（会被静态分析忽略，导致朋友圈不可用）。
 */
export function openShareMenu() {
  Taro.showShareMenu({
    withShareTicket: true,
    menus: ['shareAppMessage', 'shareTimeline']
  } as any);
}
