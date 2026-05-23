// 秒 → "MM:SS"
export function fmtTime(sec: number): string {
  if (!sec || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// "MM:SS" → 秒
export function parseTime(str: string): number {
  const [m, s] = str.split(':').map(Number);
  return (m || 0) * 60 + (s || 0);
}
