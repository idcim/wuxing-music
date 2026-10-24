import Taro from '@tarojs/taro';
import type { AudioService, AudioCallbacks, AudioMeta } from './types';
import { siteName } from '@/stores/site';
import { logInfo, logError } from '@/utils/logger';

// 端选择：
// - 手机（iOS/Android）：BackgroundAudioManager（后台/锁屏播放靠它）
// - PC 微信（Windows/Mac）：InnerAudioContext。PC 的 BGM 是媒体元素实现，
//   实测「onPlay 假动作 + 立刻 10004 Format error」，连公共测试 MP3 都起不来；
//   InnerAudioContext 在 PC 上走 WebAudio decodeAudioData——是另一条管线，
//   不需要任何私有解码器，16-bit PCM WAV 是纯数据可解（24-bit/MP3/AAC 不行）。
//   注意它是整文件下载后解码：大文件首播慢、占内存，只作 PC 端的退路。
const IS_PC = (() => {
  try {
    const info = Taro.getDeviceInfo ? Taro.getDeviceInfo() : Taro.getSystemInfoSync();
    return info.platform === 'windows' || info.platform === 'mac';
  } catch {
    return false;
  }
})();

// ── BackgroundAudioManager（手机）──
// BackgroundAudioManager 为全局单例，支持锁屏/后台继续播放。
// 注意：title 必填，否则 src 赋值会报错。
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

const bgmService: AudioService = {
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

// ── InnerAudioContext（PC 微信）──
// 每个实例绑定一套监听，release/切歌时 destroy 旧实例（同时终止下载），
// 下次 load 重建——InnerAudioContext 本就不是单例，没有 BackgroundAudioManager
// 那套「回调越积越多」的问题。
function createInnerService(): AudioService {
  let ctx: Taro.InnerAudioContext | null = null;
  let boundCb: AudioCallbacks = {};

  function bind(c: Taro.InnerAudioContext): void {
    c.onPlay(() => {
      logInfo('audio', 'onPlay(inner)');
      boundCb.onPlay?.();
    });
    c.onPause(() => boundCb.onPause?.());
    c.onStop(() => boundCb.onStop?.());
    c.onEnded(() => boundCb.onEnded?.());
    c.onError((res) => {
      logError('audio', 'onError(inner)', res);
      boundCb.onError?.(res);
    });
    c.onWaiting(() => boundCb.onWaiting?.());
    c.onCanplay(() => boundCb.onCanplay?.());
    c.onTimeUpdate(() => {
      boundCb.onTimeUpdate?.(c.currentTime, c.duration);
      const b = c.buffered;
      if (typeof b === 'number') boundCb.onProgress?.(b, c.duration);
    });
  }

  return {
    load(url, meta, callbacks: AudioCallbacks = {}) {
      boundCb = callbacks;
      ctx?.destroy();
      const c = Taro.createInnerAudioContext();
      ctx = c;
      bind(c);
      const host = url.startsWith('http') ? new URL(url).host : url.slice(0, 40);
      logInfo('audio', `load(inner) ${meta.title} @ ${host}`);
      c.src = url;
      // InnerAudioContext 设置 src 不自动播放（除非 autoplay），显式 play 语义更清晰
      c.play();
    },
    play() {
      ctx?.play();
    },
    pause() {
      ctx?.pause();
    },
    stop() {
      ctx?.stop();
    },
    seek(sec) {
      ctx?.seek(sec);
    },
    release() {
      boundCb = {};
      ctx?.destroy();
      ctx = null;
    },
    destroy() {
      ctx?.destroy();
      ctx = null;
      boundCb = {};
    }
  };
}

const service: AudioService = IS_PC ? createInnerService() : bgmService;

export default service;
