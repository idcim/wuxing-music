import { create } from 'zustand';
import type { Track } from '@/types';
import audioService from '@/services/audio';
import { useUserStore } from './user';

let timerId: ReturnType<typeof setTimeout> | null = null;

interface PlayerStore {
  currentTrack: Track | null;
  isPlaying: boolean;
  progress: number;          // 0-100
  currentTime: number;       // 秒
  timerVal: number | null;   // 睡眠定时分钟数
  showUpgrade: boolean;      // 试听到限触发升级提示
  play: (track: Track) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setTimer: (min: number | null) => void;
  dismissUpgrade: () => void;
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  currentTrack: null,
  isPlaying: false,
  progress: 0,
  currentTime: 0,
  timerVal: null,
  showUpgrade: false,

  play: (track) => {
    const { isPremium } = useUserStore.getState();
    audioService.load(track.audioUrl, {
      onPlay: () => set({ isPlaying: true }),
      onPause: () => set({ isPlaying: false }),
      onEnded: () => set({ isPlaying: false, progress: 100 }),
      onError: (err) => {
        console.error('[audio]', err);
        set({ isPlaying: false });
      },
      onTimeUpdate: (cur, dur) => {
        // 非会员、付费曲目：仅试听 previewSec 秒
        const limit = track.previewSec ?? 30;
        if (!isPremium && track.isPremium && cur >= limit) {
          audioService.pause();
          set({ showUpgrade: true });
          return;
        }
        set({ currentTime: cur, progress: dur ? (cur / dur) * 100 : 0 });
      }
    });
    audioService.play();
    set({ currentTrack: track, isPlaying: true, progress: 0, currentTime: 0 });
  },

  pause: () => {
    audioService.pause();
    set({ isPlaying: false });
  },

  resume: () => {
    audioService.play();
    set({ isPlaying: true });
  },

  stop: () => {
    audioService.stop();
    if (timerId) { clearTimeout(timerId); timerId = null; }
    set({ isPlaying: false, currentTrack: null, progress: 0, currentTime: 0, timerVal: null });
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
