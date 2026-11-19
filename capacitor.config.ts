import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cn.azureglow.wuxing.preview',
  appName: '五行律音体验版',
  webDir: 'dist-android',
  backgroundColor: '#03050a',
  android: { backgroundColor: '#03050a' },
  plugins: { CapacitorHttp: { enabled: true } },
};

export default config;
