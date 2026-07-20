import { request } from '@/services/api';
import type { WechatService, PayParams } from './types';

// 微信 JS-SDK CDN 地址（仅在 H5 端动态注入，不会打进小程序包）。
const JWEIXIN_SRC = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js';

// window.wx（JS-SDK 全局对象）最小类型声明。
interface WxJsSdk {
  config(cfg: Record<string, unknown>): void;
  ready(cb: () => void): void;
  error(cb: (err: unknown) => void): void;
  chooseWXPay(opts: Record<string, unknown>): void;
}

function getWx(): WxJsSdk | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { wx?: WxJsSdk }).wx : undefined;
}

// 动态注入 jweixin：脚本去重（并发调用共用同一 Promise），加载完成/失败 Promise 化。
let sdkLoading: Promise<void> | null = null;
function loadSdk(): Promise<void> {
  if (getWx()) return Promise.resolve();
  if (sdkLoading) return sdkLoading;
  sdkLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = JWEIXIN_SRC;
    script.onload = () => resolve();
    script.onerror = () => {
      sdkLoading = null; // 允许下次重试
      reject(new Error('微信 JS-SDK 加载失败'));
    };
    document.head.appendChild(script);
  });
  return sdkLoading;
}

interface JsSdkConfig {
  appId: string;
  timestamp: number | string;
  nonceStr: string;
  signature: string;
  configured: boolean;
}

const service: WechatService = {
  async configJsSdk(url: string) {
    await loadSdk();
    // 微信 JS-SDK 签名要求用「去掉 #hash」的页面 URL；Taro H5 为 hash 路由，
    // location.href 形如 https://host/path#/pages/...，必须先剥离 hash，否则
    // wx.config 会因签名与页面 URL 不一致而校验失败（invalid signature）。
    // 注：iOS 微信对 SPA 用「首次进入页面的 URL」签名，若 SPA 路由跳转后签名失效，
    // 需改用进入时缓存的 entry URL 重签（真机联调时按需处理，见 docs/ROADMAP）。
    const signUrl = url.split('#')[0];
    const cfg = await request<JsSdkConfig>(
      `/api/mp/h5/jssdk-config?url=${encodeURIComponent(signUrl)}`,
      { auth: false }
    );
    if (!cfg.configured) throw new Error('公众号 JS-SDK 未配置');

    const wx = getWx();
    if (!wx) throw new Error('微信 JS-SDK 未就绪');

    await new Promise<void>((resolve, reject) => {
      wx.ready(() => resolve());
      wx.error((err) => reject(err));
      wx.config({
        debug: false,
        appId: cfg.appId,
        timestamp: cfg.timestamp,
        nonceStr: cfg.nonceStr,
        signature: cfg.signature,
        jsApiList: ['chooseWXPay']
      });
    });
  },

  async chooseWXPay(p: PayParams) {
    const wx = getWx();
    if (!wx) throw new Error('微信 JS-SDK 未就绪');

    await new Promise<void>((resolve, reject) => {
      wx.chooseWXPay({
        timestamp: p.timeStamp, // 注意：JS-SDK 用小写 timestamp（下单参数是 timeStamp）
        nonceStr: p.nonceStr,
        package: p.package,
        signType: p.signType,
        paySign: p.paySign,
        success: () => resolve(),
        fail: (err: unknown) => reject(err)
      });
    });
  }
};

export default service;
