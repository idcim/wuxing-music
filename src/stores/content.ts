import { create } from 'zustand';
import type { WuxingElement, Track, ElementId } from '@/types';
import { WUXING, ELEMENT_LIST } from '@/constants/wuxing';

interface ContentStore {
  elements: WuxingElement[];
  getElement: (id: ElementId) => WuxingElement;
  getTracksByElement: (id: ElementId) => Track[];
  getTrackById: (trackId: number) => Track | undefined;
}

export const useContentStore = create<ContentStore>(() => ({
  elements: ELEMENT_LIST,
  getElement: (id) => WUXING[id],
  getTracksByElement: (id) => WUXING[id].tracks,
  getTrackById: (trackId) =>
    ELEMENT_LIST.flatMap((e) => e.tracks).find((t) => t.id === trackId)
}));
