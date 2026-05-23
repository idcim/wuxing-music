import { create } from 'zustand';
import type { Track } from '@/types';
import audioService from '@/services/audio';
import { USE_MOCK, MOCK_AUDIO_URL } from '@/constants/env';
import { resolveUrl } from '@/utils/url';
import { request } from '@/services/api';
import { useUserStore } from './user';

let timerId: ReturnType<typeof setTimeout> | null = null;

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
  timerVal: null,
  showUpgrade: false,

  // 内部：真正加载并播放某曲目
  _start: (track: Track) => {
    const { isPremium } = useUserStore.getState();
    const url = resolveUrl(track.audioUrl) || (USE_MOCK ? MOCK_AUDIO_URL : '');
    if (!url) {
      console.warn('[player] 曲目无音频地址', track.id);
      return;
    }
    audioService.load(
      url,
      { title: track.title, epname: track.tag, singer: track.hz },
      {
        onPlay: () => set({ isPlaying: true, isLoading: false }),
        onPause: () => set({ isPlaying: false }),
        onEnded: () => {
          set({ isPlaying: false, progress: 100 });
          // 自动续播下一首
          get().next();
        },
        onWaiting: () => set({ isLoading: true }),
        onCanplay: () => set({ isLoading: false }),
        onError: (err) => {
          console.error('[audio]', err);
          set({ isPlaying: false, isLoading: false });
        },
        onTimeUpdate: (cur, dur) => {
          const limit = track.previewSec ?? 30;
          if (!isPremium && track.isPremium && cur >= limit) {
            audioService.pause();
            set({ showUpgrade: true });
            return;
          }
          set({ currentTime: cur, progress: dur ? (cur / dur) * 100 : 0 });
        }
      }
    );
    set({ currentTrack: track, isLoading: true, isPlaying: true, progress: 0, currentTime: 0 });

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
    audioService.play();
    set({ isPlaying: true });
  },

  seek: (sec) => {
    audioService.seek(sec);
    set({ currentTime: sec });
  },

  stop: () => {
    audioService.stop();
    if (timerId) { clearTimeout(timerId); timerId = null; }
    set({
      isPlaying: false,
      isLoading: false,
      currentTrack: null,
      queue: [],
      order: [],
      progress: 0,
      currentTime: 0,
      timerVal: null
    });
  },

  setTimer: (min) => {
    if (timerId) { clearTimeout(timerId); timerId = null; }
    if (min) {
      timerId = setTimeout(() => {
        get().stop();
      }, min * 60 * 1000);
    }
    set({ timerVal: min });
  },

  dismissUpgrade: () => set({ showUpgrade: false })
}));
