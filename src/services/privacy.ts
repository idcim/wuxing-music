import Taro from '@tarojs/taro';
import { isWeapp } from '@/utils/platform';

// 微信后台维护的《小程序隐私保护指引》是实际生效的隐私政策。
export function openWeappPrivacyPolicy(): void {
  if (!isWeapp) return;
  Taro.openPrivacyContract({
    fail: () => Taro.showToast({ title: '隐私政策暂无法打开，请稍后重试', icon: 'none' })
  });
}
