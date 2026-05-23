import Taro from '@tarojs/taro';
import type { AudioService, AudioCallbacks, AudioMeta } from './types';

// BackgroundAudioManager 为全局单例，支持锁屏/后台继续播放。
// 注意：title 必填，否则 src 赋值会报错。
let mgr: Taro.BackgroundAudioManager | null = null;

function getMgr(): Taro.BackgroundAudioManager {
  if (!mgr) mgr = Taro.getBackgroundAudioManager();
  return mgr;
}

const service: AudioService = {
  load(url, meta: AudioMeta, callbacks: AudioCallbacks = {}) {
    const m = getMgr();

    // 重新绑定回调（off* 在部分基础库不可用，直接覆盖式 on*）
    if (callbacks.onPlay) m.onPlay(callbacks.onPlay);
    if (callbacks.onPause) m.onPause(callbacks.onPause);
    if (callbacks.onStop) m.onStop(callbacks.onStop);
    if (callbacks.onEnded) m.onEnded(callbacks.onEnded);
    if (callbacks.onError) m.onError(() => callbacks.onError!(undefined));
    if (callbacks.onWaiting) m.onWaiting(callbacks.onWaiting);
    if (callbacks.onCanplay) m.onCanplay(callbacks.onCanplay);
    if (callbacks.onTimeUpdate) {
      m.onTimeUpdate(() => callbacks.onTimeUpdate!(m.currentTime, m.duration));
    }

    // title 必须先于 src 设置
    m.title = meta.title;
    m.epname = meta.epname || '五行律音';
    m.singer = meta.singer || '五行律音';
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
  destroy() {
    mgr?.stop();
    mgr = null;
  }
};

export default service;
