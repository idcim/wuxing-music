import { create } from 'zustand';
import type { WuxingElement, Track, ElementId } from '@/types';
import { WUXING, ELEMENT_LIST } from '@/constants/wuxing';
import { fetchElements } from '@/services/content';

interface ContentStore {
  elements: WuxingElement[];
  getElement: (id: ElementId) => WuxingElement;
  getElementOfTrack: (track: Track | null, fallback?: ElementId | null) => WuxingElement;
  getTracksByElement: (id: ElementId) => Track[];
  getTrackById: (trackId: number) => Track | undefined;
  hydrate: () => Promise<void>;
}

export const useContentStore = create<ContentStore>((set, get) => ({
  // 初始用本地常量，保证首屏即时可用；hydrate 后替换为后端数据
  elements: ELEMENT_LIST,

  getElement: (id) => get().elements.find((e) => e.id === id) || WUXING[id],

  /**
   * 曲目所属的五行。播放器 / 迷你条 / 播放列表用它取音名与配色——
   * 这些界面展示的是「正在听的这首曲」，拿用户体质顶替会出现
   * 听水的曲子却写「徵音」、背景还是火的橙色。
   *
   * elementId 是 v1.8.0 才加的出参，旧缓存与 mock 数据没有，
   * 所以还要能从曲库里反查；都查不到才退回用户体质（fallback）。
   */
  getElementOfTrack: (track, fallback) => {
    const els = get().elements;
    if (track?.elementId) return get().getElement(track.elementId);
    if (track) {
      const owner = els.find((e) => e.tracks.some((t) => t.id === track.id));
      if (owner) return owner;
    }
    return get().getElement((fallback || '木') as ElementId);
  },

  getTracksByElement: (id) => get().getElement(id).tracks,

  getTrackById: (trackId) =>
    get().elements.flatMap((e) => e.tracks).find((t) => t.id === trackId),

  // 从后端拉取并替换（mock 下返回本地常量，等价无操作）
  hydrate: async () => {
    try {
      const els = await fetchElements();
      if (els && els.length) {
        set({ elements: els });
        // 同步刷新 WUXING 索引引用（供直接 import WUXING 的页面读取最新曲目/音频）
        els.forEach((e) => { WUXING[e.id] = e; });
      }
    } catch {
      // 拉取失败保留本地常量
    }
  }
}));
