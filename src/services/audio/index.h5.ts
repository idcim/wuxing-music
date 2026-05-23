import type { AudioService, AudioCallbacks, AudioMeta } from './types';

// H5 实现：HTMLAudioElement
let el: HTMLAudioElement | null = null;

const service: AudioService = {
  load(url, _meta: AudioMeta, callbacks: AudioCallbacks = {}) {
    if (el) { el.pause(); el = null; }
    el = new Audio(url);
    if (callbacks.onPlay) el.addEventListener('play', callbacks.onPlay);
    if (callbacks.onPause) el.addEventListener('pause', callbacks.onPause);
    if (callbacks.onEnded) el.addEventListener('ended', callbacks.onEnded);
    if (callbacks.onError) el.addEventListener('error', (e) => callbacks.onError!(e));
    if (callbacks.onWaiting) el.addEventListener('waiting', callbacks.onWaiting);
    if (callbacks.onCanplay) el.addEventListener('canplay', callbacks.onCanplay);
    if (callbacks.onTimeUpdate) {
      el.addEventListener('timeupdate', () => {
        callbacks.onTimeUpdate!(el!.currentTime, el!.duration || 0);
      });
    }
    el.play();
  },
  play() { el?.play(); },
  pause() { el?.pause(); },
  stop() { if (el) { el.pause(); el.currentTime = 0; } },
  seek(sec) { if (el) el.currentTime = sec; },
  destroy() { if (el) { el.pause(); el = null; } }
};

export default service;
