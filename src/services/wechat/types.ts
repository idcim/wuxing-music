// 微信支付参数（后端统一下单二次签名后下发；与 services/pay.ts 的下单返回同构）。
export interface PayParams {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: 'MD5' | 'HMAC-SHA256' | 'RSA';
  paySign: string;
}

// 微信能力抽象（分端实现）：
// - H5（公众号内）：注入 JS-SDK、config 后调起 chooseWXPay
// - 小程序：桩实现，支付走 Taro.requestPayment，不经此服务
export interface WechatService {
  // 注入并配置 JS-SDK，url 为当前页完整地址（用于后端按 URL 签名）
  configJsSdk(url: string): Promise<void>;
  // 调起微信支付（H5 公众号 JSAPI）
  chooseWXPay(p: PayParams): Promise<void>;
}
