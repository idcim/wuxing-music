import Taro from '@tarojs/taro';
import type { AudioService, AudioCallbacks } from './types';

// 小程序音频实现：用 InnerAudioContext（前台），后台/锁屏阶段二切 BackgroundAudioManager
let ctx: Taro.InnerAudioContext | null = null;

const service: AudioService = {
  load(url, callbacks: AudioCallbacks = {}) {
    if (ctx) ctx.destroy();
    ctx = Taro.createInnerAudioContext();
    ctx.src = url;
    ctx.obeyMuteSwitch = false; // iOS 静音模式下仍可播放

    if (callbacks.onPlay) ctx.onPlay(callbacks.onPlay);
    if (callbacks.onPause) ctx.onPause(callbacks.onPause);
    if (callbacks.onStop) ctx.onStop(callbacks.onStop);
    if (callbacks.onEnded) ctx.onEnded(callbacks.onEnded);
    if (callbacks.onError) ctx.onError((err) => callbacks.onError!(err));
    if (callbacks.onTimeUpdate) {
      ctx.onTimeUpdate(() => {
        callbacks.onTimeUpdate!(ctx!.currentTime, ctx!.duration);
      });
    }
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
  destroy() {
    ctx?.destroy();
    ctx = null;
  }
};

export default service;
