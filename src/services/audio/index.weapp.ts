import Taro from '@tarojs/taro';
import type { AudioService, AudioCallbacks, AudioMeta } from './types';
import { siteName } from '@/stores/site';
import { logInfo, logError } from '@/utils/logger';

// BackgroundAudioManager 为全局单例，支持锁屏/后台继续播放。
// 注意：title 必填，否则 src 赋值会报错。
//
// 为什么 PC 微信（Windows/Mac）也用它而不是 InnerAudioContext：
// PC 端的 InnerAudioContext 是 WebAudio 实现——decodeAudioData 要把整个文件
// 读进内存解码（本项目曲目可达数百 MB，必炸），且那套 Chromium 不带 MP3/AAC
// 私有解码器、也不支持 24-bit WAV（报 Unable to decode audio data）。
// BackgroundAudioManager 在 PC 是流式原生路径，官方文档标注支持 Windows/Mac。
let mgr: Taro.BackgroundAudioManager | null = null;
// 回调经这一层间接分发：on* 在部分基础库没有配套的 off*，每次 load 都重新 on
// 会让旧曲目的回调一直挂在全局单例上越积越多。改成只注册一次、内容随 bound 变化。
let bound: AudioCallbacks = {};
let listening = false;

function getMgr(): Taro.BackgroundAudioManager {
  if (!mgr) mgr = Taro.getBackgroundAudioManager();
  return mgr;
}

function bindOnce(m: Taro.BackgroundAudioManager): void {
  if (listening) return;
  listening = true;
  m.onPlay(() => {
    logInfo('audio', 'onPlay');
    bound.onPlay?.();
  });
  m.onPause(() => bound.onPause?.());
  m.onStop(() => bound.onStop?.());
  m.onEnded(() => bound.onEnded?.());
  // Taro 类型声明里 onError 回调不带参，但真实回调带 {errCode, errMsg}
  // （「Unable to decode audio data」这种关键线索全靠它），绕过类型拿到它
  (m.onError as (fn: (res?: unknown) => void) => void)((res) => {
    logError('audio', 'onError', res);
    bound.onError?.(res ?? undefined);
  });
  m.onWaiting(() => bound.onWaiting?.());
  m.onCanplay(() => bound.onCanplay?.());
  m.onTimeUpdate(() => {
    bound.onTimeUpdate?.(m.currentTime, m.duration);
    // 微信的 buffered 是「已缓冲到第几秒」，与 H5 的口径一致，顺带一起上报。
    // 没有独立的 progress 事件，只能搭 timeupdate 的车。
    const b = (m as unknown as { buffered?: number }).buffered;
    if (typeof b === 'number') bound.onProgress?.(b, m.duration);
  });
}

const service: AudioService = {
  load(url, meta: AudioMeta, callbacks: AudioCallbacks = {}) {
    const m = getMgr();
    bound = callbacks;
    bindOnce(m);
    // 只记域名不记签名参数（签名地址十分钟就过期，记全文没意义）
    const host = url.startsWith('http') ? new URL(url).host : url.slice(0, 40);
    logInfo('audio', `load ${meta.title} @ ${host}`);

    // title 必须先于 src 设置
    m.title = meta.title;
    m.epname = meta.epname || siteName();
    m.singer = meta.singer || siteName();
    if (meta.coverImgUrl) m.coverImgUrl = meta.coverImgUrl;
    m.src = url; // 赋值即开始加载并自动播放
  },
  play() {
    getMgr().play();
  },
  pause() {
    getMgr().pause();
  },
  stop() {
    getMgr().stop();
  },
  seek(sec) {
    getMgr().seek(sec);
  },
  // 断流：小程序侧 stop() 即会终止当前音源的加载并清空播放态。
  // 与 destroy() 的区别是保留单例（以及 bindOnce 在管理器上注册的监听），便于随后重新 load。
  //
  // 先摘掉 bound 再 stop：停掉音源后管理器仍可能吐 onWaiting，而它会把 store 的
  // isLoading 重新置真，此时已无音源、onCanplay 永不到达，播放键就永久转圈了
  // （与 H5 端同一个坑，详见 index.h5.ts 的 release）。load() 时会重新赋值 bound。
  release() {
    bound = {};
    mgr?.stop();
  },
  destroy() {
    mgr?.stop();
    mgr = null;
    bound = {};
    listening = false;
  }
};

export default service;
