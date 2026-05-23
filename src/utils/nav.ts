import Taro from '@tarojs/taro';

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
