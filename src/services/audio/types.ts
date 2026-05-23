export interface AudioCallbacks {
  onPlay?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  onEnded?: () => void;
  onError?: (err: unknown) => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

export interface AudioService {
  load(url: string, callbacks?: AudioCallbacks): void;
  play(): void;
  pause(): void;
  stop(): void;
  seek(sec: number): void;
  destroy(): void;
}
