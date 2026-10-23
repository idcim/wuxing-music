import type { Track } from '@/types';

export function appendTracks(queue: Track[], tracks: Track[]): Track[] {
  const ids = new Set(queue.map((track) => track.id));
  const additions = tracks.filter((track) => {
    if (ids.has(track.id)) return false;
    ids.add(track.id);
    return true;
  });
  return additions.length ? [...queue, ...additions] : queue;
}

export function removeTrackAt(queue: Track[], index: number): Track[] {
  if (index < 0 || index >= queue.length) return queue;
  return queue.filter((_, i) => i !== index);
}

export function getAdjacentTrack(
  queue: Track[],
  order: number[],
  currentTrack: Track | null,
  direction: 1 | -1
): Track | null {
  if (!queue.length || !order.length) return null;
  if (queue.length === 1) return queue[0];
  const currentIndex = currentTrack ? queue.findIndex((track) => track.id === currentTrack.id) : -1;
  const position = order.indexOf(currentIndex);
  const nextPosition = (position + direction + order.length) % order.length;
  return queue[order[nextPosition]] ?? null;
}

export type PlayMode = 'order' | 'shuffle' | 'pulse';

export interface PersistedPlayerQueue {
  queue: Track[];
  currentTrackId: number | null;
  playMode: PlayMode;
}

const PLAY_MODES: PlayMode[] = ['order', 'shuffle', 'pulse'];

function isTrack(value: unknown): value is Track {
  if (!value || typeof value !== 'object') return false;
  const track = value as Partial<Track>;
  return typeof track.id === 'number'
    && typeof track.title === 'string'
    && typeof track.audioUrl === 'string';
}

export function toPersistedQueue(
  queue: Track[],
  currentTrack: Track | null,
  playMode: PlayMode
): PersistedPlayerQueue {
  return {
    queue,
    currentTrackId: currentTrack?.id ?? null,
    playMode
  };
}

export function restorePersistedQueue(value: unknown): PersistedPlayerQueue {
  const raw = value && typeof value === 'object'
    ? value as Partial<PersistedPlayerQueue>
    : {};
  const queue = appendTracks(
    [],
    Array.isArray(raw.queue) ? raw.queue.filter(isTrack) : []
  );
  const playMode = PLAY_MODES.includes(raw.playMode as PlayMode)
    ? raw.playMode as PlayMode
    : 'order';
  const currentTrackId = typeof raw.currentTrackId === 'number'
    && queue.some((track) => track.id === raw.currentTrackId)
    ? raw.currentTrackId
    : null;
  return { queue, currentTrackId, playMode };
}
