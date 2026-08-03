import { useEffect } from 'react';
import Taro from '@tarojs/taro';
import { usePlayerStore } from '@/stores/player';

// 同一时刻可能有多个实例挂载：Taro 会把上一个页面留在页面栈里（H5 下 DOM 也还在），
// 于是 MiniPlayer 与全屏播放器的 UpgradePrompt 会同时收到 showUpgrade。
// 用模块级标志保证一次只弹一个。
let handling = false;

/**
 * 试听到限（默认 30 秒）时的升级引导。
 *
 * 原先这段逻辑只写在 MiniPlayer 里，而 pages/player 并不渲染 MiniPlayer——
 * 用户在全屏播放器里听到 30 秒，音频就那么停了，没有任何解释。
 * 抽成组件后两处都挂：谁在前台谁弹。
 */
export default function UpgradePrompt() {
  const showUpgrade = usePlayerStore((s) => s.showUpgrade);
  const dismissUpgrade = usePlayerStore((s) => s.dismissUpgrade);

  useEffect(() => {
    if (!showUpgrade || handling) return;
    handling = true;
    Taro.showModal({
      title: '试听结束',
      content: '开通会员，畅听全部专属音律',
      confirmText: '去开通',
      cancelText: '再想想',
      success: (res) => {
        // 用 navigateTo 而非 redirectTo：后者会销毁当前页，
        // 用户从会员页返回时回不到刚在试听的那首曲子。
        if (res.confirm) Taro.navigateTo({ url: '/pages/member/index' });
      },
      complete: () => {
        handling = false;
        dismissUpgrade();
      }
    });
  }, [showUpgrade, dismissUpgrade]);

  return null;
}
