export interface AudioMeta {
  title: string;
  epname?: string;           // 专辑名（后台播放页显示）
  singer?: string;
  coverImgUrl?: string;
}

export interface AudioCallbacks {
  onPlay?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  onEnded?: () => void;
  onError?: (err: unknown) => void;
  onWaiting?: () => void;    // 缓冲中（loading）
  onCanplay?: () => void;    // 可播放（loading 结束）
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

export interface AudioService {
  load(url: string, meta: AudioMeta, callbacks?: AudioCallbacks): void;
  play(): void;
  pause(): void;
  stop(): void;
  seek(sec: number): void;
  destroy(): void;
}
