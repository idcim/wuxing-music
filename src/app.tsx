import { PropsWithChildren } from 'react';
import Taro, { useLaunch } from '@tarojs/taro';
import { useUserStore } from '@/stores/user';
import { useContentStore } from '@/stores/content';
import { usePlayerStore } from '@/stores/player';
import { useSiteStore } from '@/stores/site';
import { isH5, isInWeChat } from '@/utils/platform';
import { getToken, hasQrLoginCallback } from '@/services/auth';
import { captureAgentCode } from '@/services/agent';
import './app.scss';

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    // 先取扫码带进来的代理推广码再走登录：此刻多半还没登录态，
    // captureAgentCode 只落本地，真正的绑定在登录成功后由 store 提交。
    captureAgentCode();
    bootstrapAuth();
    // 从后端拉取五行/曲目（mock 下用本地常量）
    useContentStore.getState().hydrate();
    // 站点品牌信息（名称/副标题/LOGO）：全端标题与分享文案都取它，顺带刷 H5 页签
    useSiteStore.getState().hydrate();
    // 恢复睡眠定时（刷新/冷启动后按截止时间戳校正）
    usePlayerStore.getState().checkTimer();
    watchForeground();
  });

  return children;
}

// 启动登录引导：
// - H5 且在微信内、本地无 token → 走公众号网页授权静默登录，成功后清理 URL 上的 code/state
//   （wechatLoginH5 内部自行处理「带 code 换取 / 无 code 跳授权」）。
// - 其它端 / 已登录 → 常规缓存恢复。小程序端绝不触发 H5 逻辑。
async function bootstrapAuth(): Promise<void> {
  // 微信外浏览器的扫码授权回跳。为什么在这儿而不是登录页：qrconnect 的 redirect_uri
  // 不能带 hash（微信把 ?code=.. 拼在末尾，带 hash 就落进 fragment 里读不到），
  // 所以回跳落地是站点根路由而非发起授权的登录页，只能全局接管。
  if (isH5 && !isInWeChat && hasQrLoginCallback()) {
    try {
      const { user } = await useUserStore.getState().loginByWechatQr();
      if (user) {
        cleanOAuthParams();
        Taro.reLaunch({ url: '/pages/home/index' });
        return;
      }
    } catch (e: any) {
      // code 一次性，失败后必须抹掉，否则刷新永远是同一个错
      cleanOAuthParams();
      Taro.showToast({ title: e?.message || '扫码登录失败，请重试', icon: 'none' });
    }
    useUserStore.getState().initFromCache();
    return;
  }

  if (isH5 && isInWeChat && !getToken()) {
    try {
      const { user, devGuest } = await useUserStore.getState().loginByWechatH5();
      // user 为 null 表示正在跳转授权页，页面即将卸载，无需继续
      if (user) {
        cleanOAuthParams();
        // 开发游客兜底（公众号未配）：轻提示，区别于真实微信登录
        if (devGuest) Taro.showToast({ title: '开发环境·游客登录', icon: 'none', duration: 2500 });
      }
    } catch {
      // 网页授权失败：退回常规流程（游客态兜底）
      useUserStore.getState().initFromCache();
    }
    return;
  }
  useUserStore.getState().initFromCache();
}

// 回到前台时校正睡眠定时：H5 切后台/锁屏会节流 setTimeout，
// 定时可能晚触发甚至不触发，必须按真实时间重新判定。
function watchForeground(): void {
  if (isH5 && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) usePlayerStore.getState().checkTimer();
    });
    return;
  }
  Taro.onAppShow?.(() => usePlayerStore.getState().checkTimer());
}

// 清理地址栏上微信回跳带的 code/state，避免刷新重复换取与分享泄漏。
function cleanOAuthParams(): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  const u = new URL(window.location.href);
  if (!u.searchParams.has('code') && !u.searchParams.has('state')) return;
  u.searchParams.delete('code');
  u.searchParams.delete('state');
  window.history.replaceState({}, document.title, u.href);
}

export default App;
