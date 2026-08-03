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
  // 1.4+ 的分享接口；旧版微信只有 onMenuShare* 系列，故都声明为可选
  updateAppMessageShareData?(opts: Record<string, unknown>): void;
  updateTimelineShareData?(opts: Record<string, unknown>): void;
  onMenuShareAppMessage?(opts: Record<string, unknown>): void;
  onMenuShareTimeline?(opts: Record<string, unknown>): void;
}

// wx.config 每个页面只需成功一次：Taro H5 是 hash 路由，整个 SPA 自始至终
// 只有一次真实页面加载，签名用的 URL（去掉 #hash 后）也不会变。
// 缓存起来还能顺带绕开 iOS 微信「按首次进入页面的 URL 签名」那条坑——
// 不重复签，就不存在二次签名与页面 URL 不一致的问题。
let configured: Promise<void> | null = null;

const JS_API_LIST = [
  'chooseWXPay',
  'updateAppMessageShareData',
  'updateTimelineShareData',
  'onMenuShareAppMessage',
  'onMenuShareTimeline'
];

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

async function doConfig(url: string): Promise<void> {
  await loadSdk();
  // 微信 JS-SDK 签名要求用「去掉 #hash」的页面 URL；Taro H5 为 hash 路由，
  // location.href 形如 https://host/path#/pages/...，必须先剥离 hash，否则
  // wx.config 会因签名与页面 URL 不一致而校验失败（invalid signature）。
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
      jsApiList: JS_API_LIST
    });
  });
}

const service: WechatService = {
  configJsSdk(url: string) {
    if (configured) return configured;
    configured = doConfig(url).catch((e) => {
      configured = null;   // 失败允许重试（如首次网络抖动）
      throw e;
    });
    return configured;
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
  },

  async updateShare(info) {
    // 分享是锦上添花，配置未就绪就安静跳过，别打断页面
    try {
      await service.configJsSdk(
        typeof window !== 'undefined' ? window.location.href : ''
      );
    } catch {
      return;
    }
    const wx = getWx();
    if (!wx) return;

    const common = {
      title: info.title,
      desc: info.desc,
      link: info.link,
      imgUrl: info.imgUrl
    };
    // 新接口（JS-SDK 1.4+）；老版本微信只认 onMenuShare*，两边都设一遍。
    wx.updateAppMessageShareData?.({ ...common });
    wx.updateTimelineShareData?.({ title: info.title, link: info.link, imgUrl: info.imgUrl });
    wx.onMenuShareAppMessage?.({ ...common });
    wx.onMenuShareTimeline?.({ title: info.title, link: info.link, imgUrl: info.imgUrl });
  }
};

export default service;
