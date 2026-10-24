import Taro from '@tarojs/taro';
import { isWeapp } from '@/utils/platform';

// 轻量诊断日志：内存环形缓冲（设置页可复制）+ 微信实时日志（小程序后台
// 「运维中心 → 实时日志」可见，线上问题不用用户截图）。
// 只记关键事件（播放签发/音频回调/错误），别往里塞高频事件。

export interface LogEntry {
  ts: number;
  level: 'info' | 'error';
  tag: string;
  msg: string;
}

const MAX = 200;
const buf: LogEntry[] = [];

// Taro 对 weapp 的实时日志封装；其它端没有
const rt = isWeapp ? Taro.getRealtimeLogManager?.() : null;

function fmt(args: unknown[]): string {
  return args
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ');
}

function push(level: 'info' | 'error', tag: string, args: unknown[]): void {
  const msg = fmt(args);
  buf.push({ ts: Date.now(), level, tag, msg });
  if (buf.length > MAX) buf.splice(0, buf.length - MAX);
  const line = `[${tag}] ${msg}`;
  if (level === 'error') {
    console.error(line);
    rt?.error(line);
  } else {
    console.log(line);
    rt?.info(line);
  }
}

export function logInfo(tag: string, ...args: unknown[]): void {
  push('info', tag, args);
}

export function logError(tag: string, ...args: unknown[]): void {
  push('error', tag, args);
}

export function getLogs(): LogEntry[] {
  return [...buf];
}

export function logsToText(): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return buf
    .map((e) => {
      const d = new Date(e.ts);
      const t = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
      return `${t} ${e.level === 'error' ? '✗' : '·'} [${e.tag}] ${e.msg}`;
    })
    .join('\n');
}
