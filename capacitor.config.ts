import type { CapacitorConfig } from '@capacitor/cli';

const release = process.env.TARO_APP_ANDROID_CHANNEL === 'stable';
const config: CapacitorConfig = {
  appId: release ? 'cn.azureglow.wuxing' : 'cn.azureglow.wuxing.preview',
  appName: release ? '五行律音' : '五行律音体验版',
  webDir: 'dist-android',
  backgroundColor: '#03050a',
  android: { backgroundColor: '#03050a' },
  plugins: { CapacitorHttp: { enabled: true } },
};

export default config;
