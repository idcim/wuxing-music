// 把 #rrggbb + 0-1 透明度转 rgba()，比 8 位 hex 在小程序更可靠。
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// 原型里 ${primary}15/25/40/50 这类 8 位 hex 后缀的等价透明度映射
export const A = {
  a08: (hex: string) => alpha(hex, 0.08),
  a10: (hex: string) => alpha(hex, 0.06),
  a15: (hex: string) => alpha(hex, 0.08),
  a20: (hex: string) => alpha(hex, 0.12),
  a25: (hex: string) => alpha(hex, 0.15),
  a30: (hex: string) => alpha(hex, 0.19),
  a40: (hex: string) => alpha(hex, 0.25),
  a50: (hex: string) => alpha(hex, 0.31)
};
