import type { WuxingElement, ElementId } from '@/types';

// 占位音频地址，后续替换为 CDN 真实地址
const AUDIO_PLACEHOLDER = '';
// 首曲免费试听 30 秒，其余会员专属（前 1 首非会员可试听）
const PREVIEW_SEC = 30;

export const WUXING: Record<ElementId, WuxingElement> = {
  木: {
    id: '木',
    en: 'WOOD',
    icon: 'sprout',
    primary: '#84cc16',
    accent: '#bef264',
    glow: 'rgba(132,204,22,0.25)',
    bg: 'radial-gradient(ellipse at 25% 15%, #0a1a08 0%, #050a04 50%, #020503 100%)',
    note: '角',
    notePinyin: 'Jué',
    organ: '肝胆',
    season: '春',
    quality: '生发',
    desc: '疏肝理气 · 调和情志',
    sleepTip: '春木升发，肝气易郁。角调音律帮助疏泄郁结，柔肝宁神。',
    tracks: [
      { id: 1, title: '竹林晨露', duration: '38:20', durationSec: 2300, hz: '324Hz', tag: '深度睡眠', plays: '12.4k', audioUrl: AUDIO_PLACEHOLDER, isPremium: false, previewSec: PREVIEW_SEC },
      { id: 2, title: '春风过陌', duration: '45:00', durationSec: 2700, hz: '角调', tag: '舒肝解郁', plays: '8.9k', audioUrl: AUDIO_PLACEHOLDER, isPremium: true },
      { id: 3, title: '新芽初绿', duration: '52:15', durationSec: 3135, hz: '324Hz', tag: '助眠冥想', plays: '6.2k', audioUrl: AUDIO_PLACEHOLDER, isPremium: true }
    ]
  },
  火: {
    id: '火',
    en: 'FIRE',
    icon: 'flame',
    primary: '#f97316',
    accent: '#fdba74',
    glow: 'rgba(249,115,22,0.25)',
    bg: 'radial-gradient(ellipse at 70% 20%, #1a0a02 0%, #0d0502 50%, #050201 100%)',
    note: '徵',
    notePinyin: 'Zhǐ',
    organ: '心小肠',
    season: '夏',
    quality: '温煦',
    desc: '养心安神 · 清热除烦',
    sleepTip: '心火扰神则难寐。徵调音律引火归元，宁心定志。',
    tracks: [
      { id: 4, title: '暖阳归处', duration: '40:00', durationSec: 2400, hz: '396Hz', tag: '安心助眠', plays: '15.7k', audioUrl: AUDIO_PLACEHOLDER, isPremium: false, previewSec: PREVIEW_SEC },
      { id: 5, title: '晚霞余温', duration: '36:30', durationSec: 2190, hz: '徵调', tag: '清热宁神', plays: '11.2k', audioUrl: AUDIO_PLACEHOLDER, isPremium: true },
      { id: 6, title: '炉火细语', duration: '48:45', durationSec: 2925, hz: '396Hz', tag: '冥想放松', plays: '9.8k', audioUrl: AUDIO_PLACEHOLDER, isPremium: true }
    ]
  },
  土: {
    id: '土',
    en: 'EARTH',
    icon: 'mountain',
    primary: '#eab308',
    accent: '#fde047',
    glow: 'rgba(234,179,8,0.25)',
    bg: 'radial-gradient(ellipse at 50% 70%, #1a1305 0%, #0d0903 50%, #050402 100%)',
    note: '宫',
    notePinyin: 'Gōng',
    organ: '脾胃',
    season: '长夏',
    quality: '运化',
    desc: '健脾和胃 · 安中定志',
    sleepTip: '土居中宫，脾健则思虑少。宫调音律培土宁心，稳定入眠。',
    tracks: [
      { id: 7, title: '黄土大地', duration: '42:00', durationSec: 2520, hz: '528Hz', tag: '深度睡眠', plays: '18.3k', audioUrl: AUDIO_PLACEHOLDER, isPremium: false, previewSec: PREVIEW_SEC },
      { id: 8, title: '麦浪轻摇', duration: '39:15', durationSec: 2355, hz: '宫调', tag: '健脾安神', plays: '13.5k', audioUrl: AUDIO_PLACEHOLDER, isPremium: true },
      { id: 9, title: '稻香归田', duration: '55:00', durationSec: 3300, hz: '528Hz', tag: '冥想放松', plays: '10.1k', audioUrl: AUDIO_PLACEHOLDER, isPremium: true }
    ]
  },
  金: {
    id: '金',
    en: 'METAL',
    icon: 'gem',
    primary: '#cbd5e1',
    accent: '#f1f5f9',
    glow: 'rgba(203,213,225,0.2)',
    bg: 'radial-gradient(ellipse at 80% 25%, #0e131a 0%, #070a0f 50%, #030507 100%)',
    note: '商',
    notePinyin: 'Shāng',
    organ: '肺大肠',
    season: '秋',
    quality: '收敛',
    desc: '润肺敛神 · 收引归精',
    sleepTip: '秋金主降，肃降则神安。商调音律顺应敛降之性。',
    tracks: [
      { id: 10, title: '白露秋霜', duration: '44:30', durationSec: 2670, hz: '741Hz', tag: '助眠减压', plays: '14.6k', audioUrl: AUDIO_PLACEHOLDER, isPremium: false, previewSec: PREVIEW_SEC },
      { id: 11, title: '金风玉露', duration: '37:00', durationSec: 2220, hz: '商调', tag: '润肺宁神', plays: '9.4k', audioUrl: AUDIO_PLACEHOLDER, isPremium: true },
      { id: 12, title: '霜叶无声', duration: '50:20', durationSec: 3020, hz: '741Hz', tag: '深度冥想', plays: '7.8k', audioUrl: AUDIO_PLACEHOLDER, isPremium: true }
    ]
  },
  水: {
    id: '水',
    en: 'WATER',
    icon: 'droplets',
    primary: '#38bdf8',
    accent: '#7dd3fc',
    glow: 'rgba(56,189,248,0.25)',
    bg: 'radial-gradient(ellipse at 15% 80%, #021018 0%, #01080f 50%, #000408 100%)',
    note: '羽',
    notePinyin: 'Yǔ',
    organ: '肾膀胱',
    season: '冬',
    quality: '藏精',
    desc: '滋肾填精 · 镇静安眠',
    sleepTip: '水主藏精，肾精充则神宁。羽调音律引气归肾，深度助眠。',
    tracks: [
      { id: 13, title: '深海之息', duration: '60:00', durationSec: 3600, hz: '174Hz', tag: '深度睡眠', plays: '22.1k', audioUrl: AUDIO_PLACEHOLDER, isPremium: false, previewSec: PREVIEW_SEC },
      { id: 14, title: '冬雪无声', duration: '48:00', durationSec: 2880, hz: '羽调', tag: '滋肾安神', plays: '16.8k', audioUrl: AUDIO_PLACEHOLDER, isPremium: true },
      { id: 15, title: '潜流暗涌', duration: '53:30', durationSec: 3210, hz: '174Hz', tag: '冥想放松', plays: '12.3k', audioUrl: AUDIO_PLACEHOLDER, isPremium: true }
    ]
  }
};

export const ELEMENT_ORDER: ElementId[] = ['木', '火', '土', '金', '水'];

export const ELEMENT_LIST: WuxingElement[] = ELEMENT_ORDER.map((id) => WUXING[id]);
