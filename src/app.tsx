import { PropsWithChildren } from 'react';
import Taro, { useLaunch } from '@tarojs/taro';
import { useUserStore } from '@/stores/user';
import { useContentStore } from '@/stores/content';
import { isH5, isInWeChat } from '@/utils/platform';
import { getToken } from '@/services/auth';
import './app.scss';

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    bootstrapAuth();
    // 从后端拉取五行/曲目（mock 下用本地常量）
    useContentStore.getState().hydrate();
  });

  return children;
}

// 启动登录引导：
// - H5 且在微信内、本地无 token → 走公众号网页授权静默登录，成功后清理 URL 上的 code/state
//   （wechatLoginH5 内部自行处理「带 code 换取 / 无 code 跳授权」）。
// - 其它端 / 已登录 → 常规缓存恢复。小程序端绝不触发 H5 逻辑。
async function bootstrapAuth(): Promise<void> {
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
