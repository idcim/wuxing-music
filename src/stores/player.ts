import { create } from 'zustand';
import type { Track } from '@/types';
import audioService from '@/services/audio';
import { USE_MOCK, MOCK_AUDIO_URL } from '@/constants/env';
import { useUserStore } from './user';

let timerId: ReturnType<typeof setTimeout> | null = null;

interface PlayerStore {
  currentTrack: Track | null;
  isPlaying: boolean;
  isLoading: boolean;        // 缓冲中
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
  isLoading: false,
  progress: 0,
  currentTime: 0,
  timerVal: null,
  showUpgrade: false,

  play: (track) => {
    const { isPremium } = useUserStore.getState();
    const url = track.audioUrl || (USE_MOCK ? MOCK_AUDIO_URL : '');
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
        onEnded: () => set({ isPlaying: false, progress: 100 }),
        onWaiting: () => set({ isLoading: true }),
        onCanplay: () => set({ isLoading: false }),
        onError: (err) => {
          console.error('[audio]', err);
          set({ isPlaying: false, isLoading: false });
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
      }
    );
    // BackgroundAudioManager 在 src 赋值后自动播放，无需再调 play()
    set({ currentTrack: track, isLoading: true, isPlaying: true, progress: 0, currentTime: 0 });
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
    set({
      isPlaying: false,
      isLoading: false,
      currentTrack: null,
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
