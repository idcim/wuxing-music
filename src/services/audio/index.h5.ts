import type { AudioService, AudioCallbacks, AudioMeta } from './types';

// H5 实现：HTMLAudioElement
//
// 关键：**全程复用同一个 audio 元素**，换曲只改 src，不 new Audio()。
// iOS Safari / 微信 WKWebView 把「可否自动播放」记在元素上——元素一旦被用户手势
// 激活过就一直可播。若每首都新建元素，自动连播（onEnded → next()）发生在用户手势
// 之外、作用在一个全新未激活的元素上，会被浏览器拦掉：一张歌单放完第一首就静音停住。
let el: HTMLAudioElement | null = null;
let bound: AudioCallbacks = {};

// buffered 是 TimeRanges（可能多段，seek 过就会出现空洞）。
// 取包含当前播放位置的那一段的末尾，才是「还能连续播到第几秒」。
function reportBuffered(a: HTMLAudioElement): void {
  if (!bound.onProgress) return;
  const dur = a.duration || 0;
  let end = 0;
  try {
    const r = a.buffered;
    for (let i = 0; i < r.length; i++) {
      if (a.currentTime >= r.start(i) - 0.5 && a.currentTime <= r.end(i)) {
        end = r.end(i);
        break;
      }
      end = Math.max(end, r.end(i));
    }
  } catch {
    return; // 元数据未就绪时访问 buffered 可能抛错
  }
  bound.onProgress(end, dur);
}

function ensureEl(): HTMLAudioElement {
  if (el) return el;
  const a = new Audio();
  a.preload = 'metadata';
  // 行内播放，避免 iOS 自动全屏接管
  a.setAttribute('playsinline', 'true');
  a.setAttribute('webkit-playsinline', 'true');

  // 事件只绑一次，回调内容随 bound 变化，省得换曲反复增删监听器
  a.addEventListener('play', () => bound.onPlay?.());
  a.addEventListener('pause', () => bound.onPause?.());
  a.addEventListener('ended', () => bound.onEnded?.());
  a.addEventListener('error', (e) => bound.onError?.(e));
  a.addEventListener('waiting', () => bound.onWaiting?.());
  a.addEventListener('canplay', () => bound.onCanplay?.());
  a.addEventListener('timeupdate', () => {
    bound.onTimeUpdate?.(a.currentTime, a.duration || 0);
  });
  // 弱网/服务端断流时浏览器会发 stalled，界面据此提示，别让用户对着转圈干等
  a.addEventListener('stalled', () => bound.onWaiting?.());
  // 下载进度：buffered 是一组区间，取覆盖当前播放位置的那一段的末尾
  a.addEventListener('progress', () => reportBuffered(a));
  a.addEventListener('canplaythrough', () => reportBuffered(a));

  el = a;
  return a;
}

// play() 返回的是 Promise：被自动播放策略拒绝时**不会**触发 error 事件。
// 不接住的话 store 已乐观置为 isPlaying=true，界面波形照跳而实际无声。
function safePlay(a: HTMLAudioElement): void {
  const p = a.play();
  if (p && typeof p.catch === 'function') {
    p.catch((err) => bound.onError?.(err));
  }
}

// 锁屏 / 通知栏的曲目信息与上一首下一首（浏览器支持则生效，不支持静默跳过）。
// 注：H5 无法真正后台播放，这里只保证前台切后台前的展示与控件正确。
function setMediaSession(meta: AudioMeta): void {
  const nav: any = typeof navigator !== 'undefined' ? navigator : null;
  if (!nav?.mediaSession || typeof window === 'undefined') return;
  const MD = (window as any).MediaMetadata;
  if (!MD) return;
  try {
    nav.mediaSession.metadata = new MD({
      title: meta.title,
      artist: meta.singer || '五行律音',
      album: meta.epname || '',
      artwork: meta.coverImgUrl ? [{ src: meta.coverImgUrl }] : []
    });
  } catch {
    // 某些浏览器对 artwork 跨域敏感，失败不影响播放
  }
}

const service: AudioService = {
  load(url, meta: AudioMeta, callbacks: AudioCallbacks = {}) {
    const a = ensureEl();
    bound = callbacks;
    a.src = url;
    a.currentTime = 0;
    a.load();
    setMediaSession(meta);
    safePlay(a);
  },
  play() { if (el) safePlay(el); },
  pause() { el?.pause(); },
  stop() { if (el) { el.pause(); el.currentTime = 0; } },
  seek(sec) {
    // 元数据未就绪时写 currentTime 会抛 InvalidStateError，等 loadedmetadata 再写
    if (!el) return;
    if (el.readyState > 0) {
      el.currentTime = sec;
      return;
    }
    el.addEventListener('loadedmetadata', () => { if (el) el.currentTime = sec; }, { once: true });
  },
  // 断流：清掉 src 再 load()，浏览器会立刻放弃这一轮的 Range 下载。
  // 只 pause() 是不够的——暂停后浏览器仍会把整个文件缓冲完，
  // 对上百 MB 的 WAV 来说，用户只听了 30 秒试听却把整包拉下来了。
  // 保留元素本身（复用其「已被用户手势激活」的状态，见文件头注释）。
  release() {
    if (!el) return;
    // 先摘掉回调再拆音源。removeAttribute('src') + load() 会让元素继续吐
    // abort / emptied / stalled / waiting 这些「收尾事件」，其中 stalled 与 waiting
    // 都接在 onWaiting 上，会把 store 的 isLoading 重新置为 true——
    // 而此刻已经没有音源了，canplay 永远不会来把它清掉。
    // 结果就是播放键永久转圈、toggle() 里的 `if (isLoading) return` 把点击全吞掉，
    // 用户只能刷新页面。试听到点断流是唯一会走到这里的路径，所以症状表现为
    // 「弹过一次试听结束提示后，歌就再也放不了」。
    bound = {};
    el.pause();
    el.removeAttribute('src');
    el.load();
  },
  destroy() {
    if (!el) return;
    el.pause();
    el.removeAttribute('src');
    el.load();
    bound = {};
  }
};

export default service;
