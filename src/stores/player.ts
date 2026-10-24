import { create } from 'zustand';
import type { Track } from '@/types';
import audioService from '@/services/audio';
import { USE_MOCK, MOCK_AUDIO_URL } from '@/constants/env';
import { resolveUrl } from '@/utils/url';
import { request, ApiError } from '@/services/api';
import { getPlayUrl } from '@/services/content';
import { logInfo, logError } from '@/utils/logger';
import { useUserStore } from './user';
import Taro from '@tarojs/taro';
import { storage, STORAGE_KEYS } from '@/services/storage';
import {
  appendTracks,
  getAdjacentTrack,
  removeTrackAt,
  restorePersistedQueue,
  toPersistedQueue,
  type PlayMode
} from '@/utils/queue';

let timerId: ReturnType<typeof setTimeout> | null = null;
// 睡眠定时的截止时间戳（ms）。只靠 setTimeout 在 H5 后台会被节流，
// 存下 deadline 才能在回前台时按真实时间校正。
let timerDeadline = 0;
let loadedTrackId: number | null = null;
// 本次播放请求的格式上下文（trackId → 请求的 fmt 与实际命中的 format），
// 解码失败时据此换另一种格式重试
const playFmtByTrack = new Map<number, { fmt: string; format?: string }>();
// 每曲目每会话只自动换格式重试一次（防死循环）
const fmtRetried = new Set<number>();
// 已真正开播过的曲目：之后的零星 error（缓冲抖动等）不再把界面打成失败，
// 播放真停了会有 onStop/onPause 来接管状态（实测 PC 上 onPlay 后还会吐 10004）
const playedTracks = new Set<number>();
let envLogged = false;

// 平台与基础库版本只记一次——PC 兼容性问题的第一嫌疑人就是它
function logEnvOnce(): void {
  if (envLogged) return;
  envLogged = true;
  try {
    const info = Taro.getDeviceInfo ? Taro.getDeviceInfo() : Taro.getSystemInfoSync();
    logInfo('env', `platform=${info.platform} 基础库=${(info as any).SDKVersion || '?'} 微信=${(info as any).version || '?'}`);
  } catch { /* 拿不到就算了 */ }
}

// 加载看门狗：超过这个时间还没 canplay，就认定为「慢/卡住」并提示用户
const LOAD_TIMEOUT_MS = 15000;
let loadTimer: ReturnType<typeof setTimeout> | null = null;
function clearLoadTimer(): void {
  if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
}

// 顺序 / 随机 / 悦动（本命优先智能洗牌，类心动模式）
export type { PlayMode } from '@/utils/queue';

interface PlayerStore {
  currentTrack: Track | null;
  queue: Track[];            // 当前播放队列
  order: number[];           // 播放次序（queue 的下标序列，按 playMode 生成）
  playMode: PlayMode;
  isPlaying: boolean;
  isLoading: boolean;        // 缓冲中
  progress: number;          // 0-100
  currentTime: number;       // 秒
  duration: number;          // 秒，来自音频实际时长（曲目元数据可能为 0）
  buffered: number;          // 已缓冲到第几秒（画二级进度条）
  previewEnded: boolean;     // 试听到点已断流，再次播放需重新加载
  previewClip: boolean;      // 当前播放的是服务端试听剪辑（到点自然结束，转升级引导而非自动下一首）
  loadError: string;         // 加载失败/超时的可展示原因（空串表示无错）
  retry: () => void;         // 重新加载当前曲目
  timerVal: number | null;   // 睡眠定时分钟数
  showUpgrade: boolean;      // 试听到限触发升级提示
  _start: (track: Track) => void;   // 内部：加载并播放
  play: (track: Track) => void;
  playWithQueue: (track: Track, queue: Track[]) => void;
  playAt: (index: number) => void;   // 按 queue 下标播放
  addToQueue: (track: Track) => boolean;
  addAllToQueue: (tracks: Track[]) => number;
  removeFromQueue: (index: number) => void;
  next: () => void;
  prev: () => void;
  setPlayMode: (m: PlayMode) => void;
  cyclePlayMode: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  seek: (sec: number) => void;
  setTimer: (min: number | null) => void;
  checkTimer: () => void;          // 按 wall-clock 校正睡眠定时
  dismissUpgrade: () => void;
}

// Fisher-Yates 洗牌（不改原数组）
function shuffleIndices(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 悦动：本命体质优先的智能洗牌。
// 把与用户当前五行匹配的曲目（同 tag/同元素曲库）洗牌后排前面，其余洗牌后跟随。
function pulseOrder(queue: Track[]): number[] {
  const element = useUserStore.getState().element;
  const idx = queue.map((_, i) => i);
  if (!element) return shuffleIndices(queue.length);

  // 用户本命：偏好「会员可听 + 试听更长」的曲目，做加权优先
  const preferred: number[] = [];
  const rest: number[] = [];
  for (const i of idx) {
    const t = queue[i];
    // 与本命相关性：免费曲优先（更易完整聆听），其余次之
    if (!t.isPremium) preferred.push(i);
    else rest.push(i);
  }
  const sh = (a: number[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  return [...sh(preferred), ...sh(rest)];
}

function buildOrder(queue: Track[], mode: PlayMode): number[] {
  if (queue.length === 0) return [];
  if (mode === 'shuffle') return shuffleIndices(queue.length);
  if (mode === 'pulse') return pulseOrder(queue);
  return Array.from({ length: queue.length }, (_, i) => i); // order
}

const restoredQueue = restorePersistedQueue(storage.get(STORAGE_KEYS.PLAYER_QUEUE));

function persistPlayerQueue(queue: Track[], currentTrack: Track | null, playMode: PlayMode): void {
  storage.set(STORAGE_KEYS.PLAYER_QUEUE, toPersistedQueue(queue, currentTrack, playMode));
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  currentTrack: restoredQueue.queue.find((track) => track.id === restoredQueue.currentTrackId) || null,
  queue: restoredQueue.queue,
  order: buildOrder(restoredQueue.queue, restoredQueue.playMode),
  playMode: restoredQueue.playMode,
  isPlaying: false,
  isLoading: false,
  progress: 0,
  currentTime: 0,
  duration: 0,
  buffered: 0,
  previewEnded: false,
  previewClip: false,
  loadError: '',
  timerVal: null,
  showUpgrade: false,

  // 内部：真正加载并播放某曲目
  _start: (track: Track) => {
    loadedTrackId = track.id;
    clearLoadTimer();
    // 加载看门狗：迟迟等不到 canplay 就给用户一句话，
    // 而不是让 spinner 永远转下去（大文件 + 弱网时最容易发生）。
    //
    // ⚠️ 必须同时把 isLoading 放开。只写 loadError 是不够的——播放器页的 toggle()
    // 第一行就是 `if (isLoading) return`，isLoading 不解除的话按钮会永久失效：
    // 用户看到的就是「一直转圈、点了没反应，只能刷新」。
    loadTimer = setTimeout(() => {
      if (get().isLoading && !get().isPlaying) {
        set({ isLoading: false, loadError: '加载较慢，请检查网络后重试' });
      }
    }, LOAD_TIMEOUT_MS);

    const callbacks = {
      onPlay: () => {
        clearLoadTimer();
        playedTracks.add(track.id);
        set({ isPlaying: true, isLoading: false, loadError: '' });
      },
      onPause: () => set({ isPlaying: false }),
      onEnded: () => {
        clearLoadTimer();
        set({ isPlaying: false, progress: 100 });
        // 试听剪辑到点自然结束：转升级引导，不自动切下一首
        if (get().previewClip) {
          set({ previewEnded: true, showUpgrade: true });
          return;
        }
        // 自动续播下一首
        get().next();
      },
      onWaiting: () => set({ isLoading: true }),
      onCanplay: () => {
        clearLoadTimer();
        set({ isLoading: false, loadError: '' });
      },
      onError: (err?: unknown) => {
        console.error('[audio]', err);
        clearLoadTimer();
        // 已经开播过的曲目：零星 error（缓冲抖动/seek 重缓冲）不打断播放，
        // 只记日志——之前一律 set loadError，用户看着「播放失败」其实声音还在
        if (playedTracks.has(track.id)) {
          logError('audio', `#${track.id} 播放中 error（忽略，不打断）`, err);
          return;
        }
        logError('audio', `#${track.id} onError`, err);
        // 开播前的解码失败：换一种格式重试一次（每曲目每会话一次，避免死循环）。
        // AAC 在 PC 微信的 BGM 上实测可播，与 wav16 互为备份
        const info = playFmtByTrack.get(track.id);
        if (!fmtRetried.has(track.id)) {
          const next = info?.fmt === 'aac' ? 'wav' : 'aac';
          fmtRetried.set(track.id, next);
          logInfo('play', `#${track.id} ${info?.format || info?.fmt} 失败，换 ${next} 重试`);
          get()._start(track);
          return;
        }
        // 之前只 console.error，用户面对的是一个永远转的 spinner。
        // 记下错误让界面能提示并给出重试；微信侧的 errCode/errMsg 一并透出，
        // 否则「播放不了」没有任何可定位的信息（尤其 PC 微信这类差异平台）。
        const e = (err ?? {}) as { errCode?: number | string; errMsg?: string };
        const parts = [
          e.errCode != null && e.errCode !== '' ? `errCode:${e.errCode}` : '',
          e.errMsg || ''
        ].filter(Boolean).join(' ');
        set({
          isPlaying: false,
          isLoading: false,
          loadError: `音频加载失败${parts ? `（${parts}）` : ''}`
        });
      },
      onProgress: (bufferedSec: number) => set({ buffered: bufferedSec }),
      onTimeUpdate: (cur: number, dur: number) => {
        // isPremium 必须每次实时取：若在 _start 时捕获进闭包，
        // 用户听着听着开通了会员，仍会被卡在 30 秒试听，直到重新加载曲目。
        const { isPremium } = useUserStore.getState();
        const limit = track.previewSec ?? 30;
        // 试听剪辑本身就是 previewSec 长，这条客户端截断只是双保险
        if (!isPremium && track.isPremium && cur >= limit) {
          // 必须 release 而不是 pause：暂停后底层仍会把整个文件缓冲完，
          // 上百 MB 的 WAV 只听 30 秒试听却把整包拉下来，纯属烧用户流量。
          audioService.release();
          set({
            isPlaying: false,
            isLoading: false,
            previewEnded: true,
            showUpgrade: true
          });
          return;
        }
        // duration 以音频实际值为准：聆听历史构造的 Track 其 durationSec 为 0，
        // 只靠它会让进度条退化成 1 秒（拖一下就到底）。
        set({
          currentTime: cur,
          duration: dur || get().duration,
          progress: dur ? (cur / dur) * 100 : 0
        });
      }
    };

    // isPlaying 先置 false：真正开播由 onPlay 事件置位。
    // 之前在这里乐观置 true，缓冲期间波形在跳、唱片在转，而按钮却是 spinner，自相矛盾。
    set({
      currentTrack: track,
      isLoading: true,
      isPlaying: false,
      progress: 0,
      currentTime: 0,
      buffered: 0,
      previewEnded: false,
      previewClip: false,
      loadError: '',
      duration: track.durationSec || 0
    });
    persistPlayerQueue(get().queue, track, get().playMode);

    if (!USE_MOCK) {
      request('/api/mp/history', {
        method: 'POST',
        data: { track_id: track.id },
        auth: true
      }).catch(() => {});
    }

    const meta = { title: track.title, epname: track.tag, singer: track.hz };
    if (USE_MOCK) {
      audioService.load(resolveUrl(track.audioUrl || '') || MOCK_AUDIO_URL, meta, callbacks);
      return;
    }
    // 版权保护：目录接口不含音频地址，播放前用曲目 id 换短时效签名地址。
    // 全端优先 AAC 副本（省流量；PC 微信 BGM 实测可播 AAC）；
    // 解码失败时 onError 里自动换另一种格式重试一次。
    const fmt = fmtRetried.get(track.id) ?? 'aac';
    logEnvOnce();
    logInfo('play', `#${track.id} ${track.title} 签发请求 fmt=${fmt}`);
    getPlayUrl(track.id, fmt)
      .then((res) => {
        // 换地址期间用户可能已经切歌/停止了，别覆盖别人的播放
        if (loadedTrackId !== track.id) return;
        playFmtByTrack.set(track.id, { fmt, format: res.format });
        // 签发结果只记形态不记地址本体（签名地址有时效，记了也没用）
        const host = res.url.startsWith('http') ? new URL(res.url).host : 'local-token';
        logInfo('play', `#${track.id} 签发 format=${res.format} preview=${res.preview} 地址=${host}`);
        set({ previewClip: res.preview });
        audioService.load(resolveUrl(res.url), meta, callbacks);
      })
      .catch((err) => {
        if (loadedTrackId !== track.id) return;
        clearLoadTimer();
        const msg = err instanceof ApiError ? err.message : '音频加载失败';
        set({ isLoading: false, isPlaying: false, loadError: msg });
        // 会员专属但没试听剪辑可发时：直接出升级引导
        if (err instanceof ApiError && err.code === 403) set({ showUpgrade: true });
      });
  },

  play: (track) => {
    // 无队列上下文时：单曲成队列，保证上下首/模式仍可用
    const cur = get().queue;
    const inQueue = cur.some((t) => t.id === track.id);
    if (!inQueue) {
      const queue = [track];
      set({ queue, order: buildOrder(queue, get().playMode) });
    }
    get()._start(track);
  },

  playWithQueue: (track, queue) => {
    set({ queue, order: buildOrder(queue, get().playMode) });
    get()._start(track);
  },

  playAt: (index) => {
    const { queue } = get();
    const t = queue[index];
    if (t) get()._start(t);
  },

  addToQueue: (track) => {
    const queue = get().queue;
    const nextQueue = appendTracks(queue, [track]);
    if (nextQueue === queue) return false;
    set({ queue: nextQueue, order: buildOrder(nextQueue, get().playMode) });
    persistPlayerQueue(nextQueue, get().currentTrack, get().playMode);
    return true;
  },

  addAllToQueue: (tracks) => {
    const queue = get().queue;
    const nextQueue = appendTracks(queue, tracks);
    if (nextQueue === queue) return 0;
    set({ queue: nextQueue, order: buildOrder(nextQueue, get().playMode) });
    persistPlayerQueue(nextQueue, get().currentTrack, get().playMode);
    return nextQueue.length - queue.length;
  },

  removeFromQueue: (index) => {
    const { queue, order, currentTrack } = get();
    const removing = queue[index];
    if (!removing) return;
    const replacement = currentTrack?.id === removing.id
      ? getAdjacentTrack(queue, order, currentTrack, 1)
      : null;
    const nextQueue = removeTrackAt(queue, index);
    if (!nextQueue.length) {
      get().stop();
      return;
    }
    set({ queue: nextQueue, order: buildOrder(nextQueue, get().playMode) });
    if (replacement) {
      get()._start(replacement);
    } else {
      persistPlayerQueue(nextQueue, currentTrack, get().playMode);
    }
  },

  next: () => {
    const { queue, order, currentTrack } = get();
    const nextTrack = getAdjacentTrack(queue, order, currentTrack, 1);
    if (nextTrack) get()._start(nextTrack);
  },

  prev: () => {
    const { queue, order, currentTrack } = get();
    const prevTrack = getAdjacentTrack(queue, order, currentTrack, -1);
    if (prevTrack) get()._start(prevTrack);
  },

  setPlayMode: (m) => {
    set({ playMode: m, order: buildOrder(get().queue, m) });
    persistPlayerQueue(get().queue, get().currentTrack, m);
  },

  cyclePlayMode: () => {
    const seq: PlayMode[] = ['order', 'shuffle', 'pulse'];
    const next = seq[(seq.indexOf(get().playMode) + 1) % seq.length];
    get().setPlayMode(next);
  },

  pause: () => {
    audioService.pause();
    set({ isPlaying: false });
  },

  resume: () => {
    // 试听到点时音源已被 release（src 清空），此时 play() 无声可播，
    // 必须重新加载整首（从头开始试听）。
    const { previewEnded, currentTrack } = get();
    if (previewEnded && currentTrack) {
      get()._start(currentTrack);
      return;
    }
    // 冷启动恢复出的曲目只有元数据，本次会话还没有加载音源。
    if (currentTrack && currentTrack.id !== loadedTrackId) {
      get()._start(currentTrack);
      return;
    }
    audioService.play();
    set({ isPlaying: true });
  },

  seek: (sec) => {
    audioService.seek(sec);
    // 大文件跨 Range 请求会有明显等待，标成缓冲中，
    // 等 canplay 回来再解除，别让界面看着像已经跳过去了
    set({ currentTime: sec, isLoading: true });
  },

  stop: () => {
    // release 而非 stop：彻底退出播放场景时也该切断后台下载
    audioService.release();
    if (timerId) { clearTimeout(timerId); timerId = null; }
    timerDeadline = 0;
    storage.remove(STORAGE_KEYS.SLEEP_DEADLINE);
    storage.remove(STORAGE_KEYS.PLAYER_QUEUE);
    loadedTrackId = null;
    clearLoadTimer();
    set({
      isPlaying: false,
      isLoading: false,
      currentTrack: null,
      queue: [],
      order: [],
      progress: 0,
      currentTime: 0,
      duration: 0,
      buffered: 0,
      previewEnded: false,
      previewClip: false,
      loadError: '',
      timerVal: null
    });
  },

  setTimer: (min) => {
    if (timerId) { clearTimeout(timerId); timerId = null; }
    if (min) {
      // 记「截止时间戳」而不是只靠 setTimeout：
      // H5 切后台/锁屏后定时器会被节流，30 分钟的定时可能晚触发甚至不触发；
      // 存下 deadline 后即可在回前台时按真实时间校正（见 checkTimer）。
      timerDeadline = Date.now() + min * 60 * 1000;
      storage.set(STORAGE_KEYS.SLEEP_DEADLINE, timerDeadline);
      timerId = setTimeout(() => get().checkTimer(), min * 60 * 1000);
    } else {
      timerDeadline = 0;
      storage.remove(STORAGE_KEYS.SLEEP_DEADLINE);
    }
    set({ timerVal: min });
  },

  // 回前台 / 定时到点时调用：按 wall-clock 判断是否该停，
  // 补上后台节流导致的偏差。未到点则重排一个新的 setTimeout。
  checkTimer: () => {
    // 刷新后模块级变量会清零，从存储里恢复一次
    if (!timerDeadline) {
      const saved = storage.get<number>(STORAGE_KEYS.SLEEP_DEADLINE);
      if (!saved) return;
      timerDeadline = saved;
      const leftMin = Math.ceil((saved - Date.now()) / 60000);
      if (leftMin > 0) set({ timerVal: leftMin });
    }
    const left = timerDeadline - Date.now();
    if (left > 0) {
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(() => get().checkTimer(), left);
      return;
    }
    timerDeadline = 0;
    storage.remove(STORAGE_KEYS.SLEEP_DEADLINE);
    get().stop();
    // 之前到点是静默清空 currentTrack：MiniPlayer 直接消失、播放器页变成
    // 「暂无播放中的曲目」，用户完全不知道发生了什么。给一句话。
    Taro.showToast({ title: '定时已到，已停止播放', icon: 'none', duration: 2500 });
  },

  retry: () => {
    const t = get().currentTrack;
    if (t) get()._start(t);
  },

  dismissUpgrade: () => set({ showUpgrade: false })
}));
