import Taro from '@tarojs/taro';
import { isAndroidApp } from '@/utils/platform';

/** 仅安卓体验包注册原生事件，小程序与 H5 不加载插件。 */
export async function setupAndroid(onForeground: () => void): Promise<void> {
  if (!isAndroidApp) return;
  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', () => {
    if (Taro.getCurrentPages().length > 1) void Taro.navigateBack();
    else void App.minimizeApp();
  });
  await App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) onForeground();
  });
}
