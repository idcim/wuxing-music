import { create } from 'zustand';
import type { Track } from '@/types';
import audioService from '@/services/audio';
import { USE_MOCK, MOCK_AUDIO_URL } from '@/constants/env';
import { resolveUrl } from '@/utils/url';
import { request } from '@/services/api';
import { useUserStore } from './user';
import Taro from '@tarojs/taro';
import { storage, STORAGE_KEYS } from '@/services/storage';

let timerId: ReturnType<typeof setTimeout> | null = null;
// 睡眠定时的截止时间戳（ms）。只靠 setTimeout 在 H5 后台会被节流，
// 存下 deadline 才能在回前台时按真实时间校正。
let timerDeadline = 0;

// 加载看门狗：超过这个时间还没 canplay，就认定为「慢/卡住」并提示用户
const LOAD_TIMEOUT_MS = 15000;
let loadTimer: ReturnType<typeof setTimeout> | null = null;
function clearLoadTimer(): void {
  if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
}

// 顺序 / 随机 / 悦动（本命优先智能洗牌，类心动模式）
export type PlayMode = 'order' | 'shuffle' | 'pulse';

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
  loadError: string;         // 加载失败/超时的可展示原因（空串表示无错）
  retry: () => void;         // 重新加载当前曲目
  timerVal: number | null;   // 睡眠定时分钟数
  showUpgrade: boolean;      // 试听到限触发升级提示
  _start: (track: Track) => void;   // 内部：加载并播放
  play: (track: Track) => void;
  playWithQueue: (track: Track, queue: Track[]) => void;
  playAt: (index: number) => void;   // 按 queue 下标播放
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

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  currentTrack: null,
  queue: [],
  order: [],
  playMode: 'order',
  isPlaying: false,
  isLoading: false,
  progress: 0,
  currentTime: 0,
  duration: 0,
  buffered: 0,
  previewEnded: false,
  loadError: '',
  timerVal: null,
  showUpgrade: false,

  // 内部：真正加载并播放某曲目
  _start: (track: Track) => {
    const url = resolveUrl(track.audioUrl) || (USE_MOCK ? MOCK_AUDIO_URL : '');
    if (!url) {
      console.warn('[player] 曲目无音频地址', track.id);
      set({ loadError: '该曲目暂无音频', isLoading: false, isPlaying: false });
      return;
    }
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

    audioService.load(
      url,
      { title: track.title, epname: track.tag, singer: track.hz },
      {
        onPlay: () => {
          clearLoadTimer();
          set({ isPlaying: true, isLoading: false, loadError: '' });
        },
        onPause: () => set({ isPlaying: false }),
        onEnded: () => {
          clearLoadTimer();
          set({ isPlaying: false, progress: 100 });
          // 自动续播下一首
          get().next();
        },
        onWaiting: () => set({ isLoading: true }),
        onCanplay: () => {
          clearLoadTimer();
          set({ isLoading: false, loadError: '' });
        },
        onError: (err) => {
          console.error('[audio]', err);
          clearLoadTimer();
          // 之前只 console.error，用户面对的是一个永远转的 spinner。
          // 记下错误让界面能提示并给出重试。
          set({ isPlaying: false, isLoading: false, loadError: '音频加载失败' });
        },
        onProgress: (bufferedSec) => set({ buffered: bufferedSec }),
        onTimeUpdate: (cur, dur) => {
          // isPremium 必须每次实时取：若在 _start 时捕获进闭包，
          // 用户听着听着开通了会员，仍会被卡在 30 秒试听，直到重新加载曲目。
          const { isPremium } = useUserStore.getState();
          const limit = track.previewSec ?? 30;
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
      }
    );
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
      loadError: '',
      duration: track.durationSec || 0
    });

    if (!USE_MOCK) {
      request('/api/mp/history', {
        method: 'POST',
        data: { track_id: track.id },
        auth: true
      }).catch(() => {});
    }
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

  next: () => {
    const { queue, order, currentTrack } = get();
    if (queue.length === 0) return;
    if (queue.length === 1) {
      // 单曲循环重播
      get()._start(queue[0]);
      return;
    }
    const curIdx = currentTrack ? queue.findIndex((t) => t.id === currentTrack.id) : -1;
    const pos = order.indexOf(curIdx);
    const nextPos = (pos + 1) % order.length;
    get()._start(queue[order[nextPos]]);
  },

  prev: () => {
    const { queue, order, currentTrack } = get();
    if (queue.length === 0) return;
    if (queue.length === 1) {
      get()._start(queue[0]);
      return;
    }
    const curIdx = currentTrack ? queue.findIndex((t) => t.id === currentTrack.id) : -1;
    const pos = order.indexOf(curIdx);
    const prevPos = (pos - 1 + order.length) % order.length;
    get()._start(queue[order[prevPos]]);
  },

  setPlayMode: (m) => {
    set({ playMode: m, order: buildOrder(get().queue, m) });
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
