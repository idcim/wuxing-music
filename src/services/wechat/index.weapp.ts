import type { WechatService, PayParams } from './types';

// 小程序端桩实现：H5 JS-SDK 路径在小程序不适用。
// 小程序支付走 Taro.requestPayment（见 services/pay.ts），不经此服务。
const service: WechatService = {
  async configJsSdk() {
    // no-op：小程序无需注入 / 配置 JS-SDK
  },
  async chooseWXPay(_p: PayParams) {
    throw new Error('小程序不走 H5 JSAPI 支付，请使用 Taro.requestPayment');
  }
};

export default service;
