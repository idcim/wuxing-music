import { create } from 'zustand';
import type { WuxingElement, Track, ElementId } from '@/types';
import { WUXING, ELEMENT_LIST } from '@/constants/wuxing';
import { fetchElements } from '@/services/content';

interface ContentStore {
  elements: WuxingElement[];
  getElement: (id: ElementId) => WuxingElement;
  getTracksByElement: (id: ElementId) => Track[];
  getTrackById: (trackId: number) => Track | undefined;
  hydrate: () => Promise<void>;
}

export const useContentStore = create<ContentStore>((set, get) => ({
  // 初始用本地常量，保证首屏即时可用；hydrate 后替换为后端数据
  elements: ELEMENT_LIST,

  getElement: (id) => get().elements.find((e) => e.id === id) || WUXING[id],

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
