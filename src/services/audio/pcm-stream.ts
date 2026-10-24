import Taro from '@tarojs/taro';
import type { AudioService, AudioCallbacks, AudioMeta } from './types';
import { logInfo, logError } from '@/utils/logger';

/**
 * PC 微信小程序的流式 PCM 播放器。
 *
 * 背景：PC 端 BGM/媒体元素运行时坏死（假 onPlay + 10004），InnerAudioContext
 * 走 decodeAudioData 整文件解码，大文件与部分编码直接失败。本实现完全不碰它们：
 * wx.request 分块（enableChunked）边下边拿 16-bit PCM 字节，手工 Int16→Float32
 * 装包成 WebAudio AudioBuffer，按时间轴 source.start(t) 顺序调度。
 * 全程无解码器（PCM 是纯数据），内存只占缓冲窗口，支持暂停/续播/seek（Range）。
 *
 * 前提：音源必须是 16-bit PCM WAV（管线的 play_url 副本，或母版本身已是 16-bit）。
 */

interface WavInfo {
  channels: number;
  sampleRate: number;
  dataOffset: number;
  dataSize: number;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b);
  return out;
}

function parseWavHeader(buf: Uint8Array): WavInfo | null {
  if (buf.length < 44) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // 'RIFF'....'WAVE'
  if (dv.getUint32(0, false) !== 0x52494646 || dv.getUint32(8, false) !== 0x57415645) {
    throw new Error('不是 WAV 文件');
  }
  let pos = 12;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  while (pos + 8 <= buf.length) {
    const id = String.fromCharCode(buf[pos], buf[pos + 1], buf[pos + 2], buf[pos + 3]);
    const size = dv.getUint32(pos + 4, true);
    if (id === 'fmt ') {
      const format = dv.getUint16(pos + 8, true);
      channels = dv.getUint16(pos + 10, true);
      sampleRate = dv.getUint32(pos + 12, true);
      bits = dv.getUint16(pos + 22, true);
      if (format !== 1 || bits !== 16) throw new Error(`只支持 16-bit PCM（format=${format} bits=${bits}）`);
    } else if (id === 'data') {
      return { channels, sampleRate, dataOffset: pos + 8, dataSize: size };
    }
    pos += 8 + size + (size & 1);
    if (pos > 1024 * 1024) throw new Error('WAV 头异常');
  }
  return null; // 头还没攒齐
}

// 把 Int16 交错 PCM 拆成每声道 Float32（WebAudio AudioBuffer 要这个形态）
function toFloat32Channels(pcm: Uint8Array, channels: number): Float32Array[] {
  const int16 = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2);
  const frames = Math.floor(int16.length / channels);
  const out: Float32Array[] = [];
  for (let c = 0; c < channels; c++) out.push(new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      out[c][i] = int16[i * channels + c] / 32768;
    }
  }
  return out;
}

export function createPcmStreamService(): AudioService {
  let ctx: any = null;
  let task: ReturnType<typeof Taro.request> | null = null;
  let bound: AudioCallbacks = {};

  let currentUrl = '';
  let wav: WavInfo | null = null;
  let headerBuf: Uint8Array = new Uint8Array(0);
  let pending: Uint8Array = new Uint8Array(0);
  let eof = false;
  let dead = false;   // 头部解析失败的死亡标记，防后续块重复报错
  let playing = false;
  let endedFired = false;

  let startCtxTime = 0;        // 本轮开播时的 ctx.currentTime
  let playedBefore = 0;        // 暂停前已累计的播放秒数
  let nextScheduleTime = 0;    // 时间轴上下一块的起点
  let sources: any[] = [];
  let durationSec = 0;
  let ticker: ReturnType<typeof setInterval> | null = null;

  const FRAME_MIN_SEC = 0.5;   // 攒够 0.5s 再出一块，太碎调度开销大

  function ensureCtx() {
    if (!ctx) ctx = (Taro as any).createWebAudioContext();
    return ctx;
  }

  function currentSec(): number {
    if (!wav || !ctx) return 0;
    if (playing) return playedBefore + (ctx.currentTime - startCtxTime);
    return playedBefore;
  }

  function startTicker(): void {
    stopTicker();
    ticker = setInterval(() => {
      if (!wav) return;
      bound.onTimeUpdate?.(currentSec(), durationSec);
      // 全程播完：文件收完 + 时间轴走完
      if (eof && !endedFired && currentSec() >= durationSec - 0.05) {
        endedFired = true;
        playing = false;
        stopTicker();
        bound.onEnded?.();
      }
    }, 500);
  }

  function stopTicker(): void {
    if (ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  }

  function drain(): void {
    if (!wav || !playing || !ctx) return;
    const frameBytes = wav.channels * 2;
    const minBytes = Math.floor(wav.sampleRate * FRAME_MIN_SEC) * frameBytes;
    while (true) {
      let n = pending.length - (pending.length % frameBytes);
      if (n <= 0 || (n < minBytes && !eof)) return;
      if (n > minBytes * 4) n = minBytes * 4 - ((minBytes * 4) % frameBytes); // 一次别吞太多
      const chunk = pending.slice(0, n);
      pending = pending.slice(n);

      const channelsData = toFloat32Channels(chunk, wav.channels);
      const frames = channelsData[0].length;
      const audioBuf = ctx.createBuffer(wav.channels, frames, wav.sampleRate);
      for (let c = 0; c < wav.channels; c++) {
        audioBuf.copyToChannel(channelsData[c] as any, c);
      }
      const src = ctx.createBufferSource();
      src.buffer = audioBuf;
      src.connect(ctx.destination);
      const t = Math.max(nextScheduleTime, ctx.currentTime + 0.05);
      src.start(t);
      nextScheduleTime = t + audioBuf.duration;
      sources.push(src);
      src.onended = () => {
        sources = sources.filter((s) => s !== src);
      };
    }
  }

  // 打开（或 seek 后重新打开）流。fromSec>0 时用 Range 从对应字节位置起拉
  // （WAV 头已在内存，seek 的流直接是 PCM 主体）。
  function openStream(url: string, fromSec: number): void {
    task?.abort();
    const headers: Record<string, string> = {};
    if (fromSec > 0 && wav) {
      const frameBytes = wav.channels * 2;
      const bytePos = wav.dataOffset + Math.floor(fromSec * wav.sampleRate) * frameBytes;
      headers.Range = `bytes=${bytePos}-`;
    }
    // 防止任何一层给 WAV 加 gzip：压缩过的字节就不是 PCM 了
    headers['Accept-Encoding'] = 'identity';
    eof = false;
    dead = false;
    pending = new Uint8Array(0);
    if (fromSec === 0) {
      wav = null;
      headerBuf = new Uint8Array(0);
    }

    task = Taro.request({
      url,
      responseType: 'arraybuffer',
      enableChunked: true,
      header: headers,
      success: (res) => {
        // 没开成分块时整包在 data 里；已分块则块都走过了 feed
        const data = res.data as ArrayBuffer;
        if (data && data.byteLength > 0) feed(new Uint8Array(data));
        eof = true;
        drain();
        logInfo('pcm', `下载完成 ${wav ? durationSec.toFixed(0) + 's' : ''}`);
      },
      fail: (err) => {
        logError('pcm', '下载失败', err);
        bound.onError?.(err);
      }
    });
    task.onChunkReceived?.((res: any) => feed(normalizeChunk(res)));
  }

  // PC 端 onChunkReceived 的数据形态没文档：先记一眼真实形态再解析（实测踩坑位）
  let chunkLogged = false;
  function normalizeChunk(res: any): Uint8Array {
    const data = res?.data ?? res;
    if (!chunkLogged) {
      chunkLogged = true;
      const kind = Array.isArray(data) ? 'array' : typeof data;
      const head =
        typeof data === 'string'
          ? data.slice(0, 32)
          : data instanceof ArrayBuffer || ArrayBuffer.isView(data)
            ? Array.from(new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer, data instanceof ArrayBuffer ? 0 : data.byteOffset, 16))
                .map((b) => b.toString(16).padStart(2, '0'))
                .join(' ')
            : '?';
      logInfo('pcm', `首块形态 type=${kind}ctor=${data?.constructor?.name} len=${data?.byteLength ?? data?.length} head=${head}`);
    }
    if (typeof data === 'string') {
      // 字符串形态按 base64 解（某些端会给 base64）
      try {
        return new Uint8Array((Taro as any).base64ToArrayBuffer(data));
      } catch {
        return new Uint8Array(0);
      }
    }
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    return new Uint8Array(0);
  }

  function feed(chunk: Uint8Array): void {
    if (dead) return;
    if (!wav) {
      headerBuf = concat(headerBuf, chunk);
      try {
        const info = parseWavHeader(headerBuf);
        if (!info) return; // 头未齐，等下一块
        wav = info;
        durationSec = info.dataSize / (info.channels * 2 * info.sampleRate);
        pending = headerBuf.slice(info.dataOffset);
        headerBuf = new Uint8Array(0);
        logInfo('pcm', `WAV 头：${info.sampleRate}Hz ${info.channels}ch ${durationSec.toFixed(0)}s`);
        bound.onCanplay?.();
      } catch (e) {
        // 把实际拿到的首字节打出来（hex），一眼看出是 XML 错误页 / gzip / 分块帧头
        const head = Array.from(headerBuf.slice(0, 32))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(' ');
        logError('pcm', '头部解析失败，首块字节:', head, '错误:', e);
        // 别每个后续块都重复炸：标记死亡并中止下载，只报一次
        if (!dead) {
          dead = true;
          task?.abort();
          bound.onError?.(e);
        }
      }
      return;
    }
    pending = concat(pending, chunk);
    drain();
  }

  const service: AudioService = {
    load(url, meta: AudioMeta, callbacks: AudioCallbacks = {}) {
      bound = callbacks;
      const c = ensureCtx();
      sources = [];
      endedFired = false;
      playedBefore = 0;
      durationSec = 0;
      playing = true;
      dead = false;
      if (c.state === 'suspended') c.resume();
      startCtxTime = c.currentTime;
      nextScheduleTime = c.currentTime + 0.1;
      currentUrl = url;
      chunkLogged = false;   // 每首重新记首块形态
      startTicker();
      logInfo('pcm', `load ${meta.title}`);
      openStream(url, 0);
      bound.onPlay?.();
    },
    play() {
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      startCtxTime = ctx.currentTime - playedBefore;
      nextScheduleTime = ctx.currentTime + 0.05;
      playing = true;
      startTicker();
      drain();   // 把暂停期间攒下的排上时间轴
      bound.onPlay?.();
    },
    pause() {
      if (!ctx) return;
      playedBefore = currentSec();
      playing = false;
      stopTicker();
      if (ctx.state === 'running') ctx.suspend();
      bound.onPause?.();
    },
    stop() {
      task?.abort();
      task = null;
      playing = false;
      stopTicker();
      for (const s of sources) {
        try { s.stop(); } catch { /* 已结束的会抛 */ }
      }
      sources = [];
      if (ctx && ctx.state === 'running') ctx.suspend();
      bound.onStop?.();
    },
    seek(sec) {
      if (!wav || !ctx) return;
      playedBefore = sec;
      for (const s of sources) {
        try { s.stop(); } catch { /* 忽略 */ }
      }
      sources = [];
      nextScheduleTime = ctx.currentTime + 0.05;
      startCtxTime = ctx.currentTime - sec;
      openStream(currentUrl, sec);
      bound.onCanplay?.();
    },
    release() {
      bound = {};
      task?.abort();
      task = null;
      stopTicker();
      playing = false;
      for (const s of sources) {
        try { s.stop(); } catch { /* 忽略 */ }
      }
      sources = [];
    },
    destroy() {
      service.release();
      if (ctx) {
        try { ctx.close(); } catch { /* 忽略 */ }
        ctx = null;
      }
    }
  };
  return service;
}
