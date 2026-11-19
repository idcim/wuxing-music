export type ThemeId = 'starlight' | 'chinese_classic';

type Palette = Record<'bg' | 'bgMid' | 'text' | 'muted' | 'subtle' | 'faint' | 'border' | 'surface' | 'accent' | 'homeBg', string>;

export const THEMES: Record<ThemeId, Palette> = {
  starlight: {
    bg: '#03050a', bgMid: '#0a0e1a', text: '#e2e8f0', muted: '#94a3b8',
    subtle: '#64748b', faint: '#475569', border: 'rgba(255,255,255,.06)',
    surface: 'rgba(255,255,255,.025)', accent: '#84cc16', homeBg: ''
  },
  chinese_classic: {
    bg: '#151810', bgMid: '#252a20', text: '#f2e8d1', muted: '#c8bda7',
    subtle: '#9f9685', faint: '#817967', border: 'rgba(224,205,162,.19)',
    surface: 'rgba(224,205,162,.07)', accent: '#cb7758',
    homeBg: 'radial-gradient(ellipse at 50% 10%, #252a20, #151810 70%)'
  }
};

export function normalizeTheme(value: unknown): ThemeId {
  return value === 'chinese_classic' ? value : 'starlight';
}

export function themeStyle(id: ThemeId): string {
  const p = THEMES[id];
  return `--theme-bg:${p.bg};--theme-bg-mid:${p.bgMid};--theme-text:${p.text};--theme-muted:${p.muted};--theme-subtle:${p.subtle};--theme-faint:${p.faint};--theme-border:${p.border};--theme-surface:${p.surface};--theme-accent:${p.accent};background-color:${p.bg};color:${p.text};`;
}

/** H5 全局容器继承变量；小程序由每页的 PageMeta 设置同一组变量。 */
export function applyTheme(id: ThemeId): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const p = THEMES[id];
  root.dataset.theme = id;
  root.style.setProperty('--theme-bg', p.bg);
  root.style.setProperty('--theme-bg-mid', p.bgMid);
  root.style.setProperty('--theme-text', p.text);
  root.style.setProperty('--theme-muted', p.muted);
  root.style.setProperty('--theme-subtle', p.subtle);
  root.style.setProperty('--theme-faint', p.faint);
  root.style.setProperty('--theme-border', p.border);
  root.style.setProperty('--theme-surface', p.surface);
  root.style.setProperty('--theme-accent', p.accent);
}
