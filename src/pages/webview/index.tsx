import { View } from '@tarojs/components';
import { WebView } from '@tarojs/components';
import { useRouter } from '@tarojs/taro';

// PC 微信小程序的音频运行时不可用（BGM/InnerAudioContext 实测全灭），
// PC 端播放由本页承载：web-view 内嵌 H5 播放页（完整浏览器内核）。
// 目标域名必须在小程序后台「开发管理 → 业务域名」里登记过。
export default function WebviewPage() {
  const router = useRouter();
  const url = decodeURIComponent(router.params.url || '');
  if (!url) return <View />;
  return <WebView src={url} />;
}
