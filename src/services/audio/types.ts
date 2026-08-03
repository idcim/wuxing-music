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
  // 已缓冲到第几秒。曲目动辄上百 MB 时，用户需要看见「在下」而不是干等；
  // 没有这一路回调，界面无从知道下载进度。
  onProgress?: (bufferedSec: number, duration: number) => void;
}

export interface AudioService {
  load(url: string, meta: AudioMeta, callbacks?: AudioCallbacks): void;
  play(): void;
  pause(): void;
  stop(): void;
  seek(sec: number): void;
  // 释放音源、**中断正在进行的下载**。stop() 只是停播，底层仍会把整个文件拉完；
  // 试听到点、或离开播放场景时必须用 release 才能真正省流量。
  release(): void;
  destroy(): void;
}
