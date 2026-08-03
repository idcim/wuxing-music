// 微信支付参数（后端统一下单二次签名后下发；与 services/pay.ts 的下单返回同构）。
export interface PayParams {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: 'MD5' | 'HMAC-SHA256' | 'RSA';
  paySign: string;
}

// 「···」菜单里的转发文案（H5 用 JS-SDK 设置；小程序走 useShareAppMessage）
export interface ShareInfo {
  title: string;
  desc: string;
  link: string;       // 分享出去的落地页，必须是同一 JS 安全域名
  imgUrl: string;     // 缩略图，需绝对地址且可公网访问
}

// 微信能力抽象（分端实现）：
// - H5（公众号内）：注入 JS-SDK、config 后调起 chooseWXPay / 设置分享
// - 小程序：桩实现，支付走 Taro.requestPayment、分享走 useShareAppMessage，不经此服务
export interface WechatService {
  // 注入并配置 JS-SDK，url 为当前页完整地址（用于后端按 URL 签名）
  configJsSdk(url: string): Promise<void>;
  // 调起微信支付（H5 公众号 JSAPI）
  chooseWXPay(p: PayParams): Promise<void>;
  // 设置「···」转发给朋友 / 分享到朋友圈的标题、描述与缩略图
  updateShare(info: ShareInfo): Promise<void>;
}
