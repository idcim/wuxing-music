import type { WuxingElement, ElementId } from '@/types';

// 占位音频地址，后续替换为 CDN 真实地址
const AUDIO_PLACEHOLDER = '';
// 首曲免费试听 30 秒，其余会员专属（前 1 首非会员可试听）
const PREVIEW_SEC = 30;

/**
 * 五行运行时数据。文化维度（meta）与文案口径的唯一基准是
 * docs/WUXING-REFERENCE.md —— 改这里之前先改那份文档。
 *
 * ⚠️ desc / sleepTip 走「音乐气质 / 适合直播讲法 / 情绪转化方向」的口径，
 * 不用「疏肝理气」「柔肝宁神」这类治疗动宾结构（平台会判为养生医疗）。
 * 后端 backend/app/seed.py::ELEMENTS 是同一份数据的另一副本，改动要同步。
 */
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
    desc: '清新生发 · 舒展流动',
    sleepTip: '角音像春天的风，让人慢慢舒展开。从郁结到舒展，适合心里绷着一股劲的夜晚。',
    meta: {
      temperament: '生发、舒展、条达',
      direction: '东',
      climate: '风',
      phase: '生',
      colorName: '青 / 绿',
      taste: '酸',
      smell: '臊',
      notation: '3 / mi',
      mode: '角调式',
      musicMood: '清新、生发、舒展、流动',
      keywords: '疏展、春天、成长、郁结舒开',
      organZang: '肝',
      organFu: '胆',
      sense: '目',
      tissue: '筋',
      bloom: '爪',
      fluid: '泪',
      emotion: '怒',
      spirit: '魂',
      voice: '呼',
      imbalance: '易怒、郁闷、憋屈、紧绷',
      transform: '从郁结到舒展',
      virtue: '仁',
      virtueFeel: '生生之德',
      beast: '青龙',
      star: '岁星',
      gan: '甲乙',
      zhi: '寅卯',
      gua: '震、巽',
      timeFeel: '清晨、生发',
      spaceFeel: '林、风、竹、山间新绿',
      imagery: '竹林、春风、绿植、舒展身体',
      mnemonic: '木主生发，音为角，脏为肝，志为怒，色为青，季为春。'
    },
    tracks: [
      { id: 1, title: '竹林晨露', duration: '38:20', durationSec: 2300, hz: '324Hz', tag: '深度睡眠', plays: '12.4k', audioUrl: AUDIO_PLACEHOLDER, isPremium: false, previewSec: PREVIEW_SEC },
      { id: 2, title: '春风过陌', duration: '45:00', durationSec: 2700, hz: '角调', tag: '舒展流动', plays: '8.9k', audioUrl: AUDIO_PLACEHOLDER, isPremium: true },
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
    quality: '明亮',
    desc: '明亮热烈 · 振奋外放',
    sleepTip: '徵音像一束光，把人的状态点亮。从沉闷到明亮，适合提不起劲的时候听。',
    meta: {
      temperament: '炎上、明亮、温热',
      direction: '南',
      climate: '暑 / 热',
      phase: '长',
      colorName: '赤 / 红',
      taste: '苦',
      smell: '焦',
      notation: '5 / sol',
      mode: '徵调式',
      musicMood: '明亮、热烈、振奋、外放',
      keywords: '点亮、心气、热情、表达',
      organZang: '心',
      organFu: '小肠',
      sense: '舌',
      tissue: '脉 / 血脉',
      bloom: '面',
      fluid: '汗',
      emotion: '喜',
      spirit: '神',
      voice: '笑',
      imbalance: '亢奋、烦躁、心神不宁',
      transform: '从沉闷到明亮',
      virtue: '礼',
      virtueFeel: '光明之德',
      beast: '朱雀',
      star: '荧惑',
      gan: '丙丁',
      zhi: '巳午',
      gua: '离',
      timeFeel: '正午、旺盛',
      spaceFeel: '日光、火焰、灯、红墙',
      imagery: '烛火、阳光、红色织物、笑容',
      mnemonic: '火主明亮，音为徵，脏为心，志为喜，色为赤，季为夏。'
    },
    tracks: [
      { id: 4, title: '暖阳归处', duration: '40:00', durationSec: 2400, hz: '396Hz', tag: '安心助眠', plays: '15.7k', audioUrl: AUDIO_PLACEHOLDER, isPremium: false, previewSec: PREVIEW_SEC },
      { id: 5, title: '晚霞余温', duration: '36:30', durationSec: 2190, hz: '徵调', tag: '明亮振奋', plays: '11.2k', audioUrl: AUDIO_PLACEHOLDER, isPremium: true },
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
    quality: '承载',
    desc: '平稳厚重 · 安定包容',
    sleepTip: '宫音像大地，把散乱的心慢慢托住。从散乱到安定，适合睡前收心。',
    meta: {
      temperament: '承载、稳定、化生',
      direction: '中',
      climate: '湿',
      phase: '化',
      colorName: '黄',
      taste: '甘',
      smell: '香',
      notation: '1 / do',
      mode: '宫调式',
      musicMood: '平稳、厚重、安定、包容',
      keywords: '安住、稳定、中心、承托',
      organZang: '脾',
      organFu: '胃',
      sense: '口',
      tissue: '肉 / 肌肉',
      bloom: '唇',
      fluid: '涎',
      emotion: '思',
      spirit: '意',
      voice: '歌',
      imbalance: '过度思虑、纠结、担忧',
      transform: '从散乱到安定',
      virtue: '信',
      virtueFeel: '厚载之德',
      beast: '黄龙 / 麒麟',
      star: '镇星',
      gan: '戊己',
      zhi: '辰戌丑未',
      gua: '坤、艮',
      timeFeel: '午后、转化',
      spaceFeel: '大地、陶土、茶席、中庭',
      imagery: '茶席、陶器、黄土、稳定构图',
      mnemonic: '土主承载，音为宫，脏为脾，志为思，色为黄，季为长夏。'
    },
    tracks: [
      { id: 7, title: '黄土大地', duration: '42:00', durationSec: 2520, hz: '528Hz', tag: '深度睡眠', plays: '18.3k', audioUrl: AUDIO_PLACEHOLDER, isPremium: false, previewSec: PREVIEW_SEC },
      { id: 8, title: '麦浪轻摇', duration: '39:15', durationSec: 2355, hz: '宫调', tag: '安定承托', plays: '13.5k', audioUrl: AUDIO_PLACEHOLDER, isPremium: true },
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
    desc: '清肃空灵 · 收敛克制',
    sleepTip: '商音像秋天的风，帮你把情绪收一收、清一清。从沉重到释放，适合心里堵得慌的时候。',
    meta: {
      temperament: '收敛、清肃、秩序',
      direction: '西',
      climate: '燥',
      phase: '收',
      colorName: '白',
      taste: '辛',
      smell: '腥',
      notation: '2 / re',
      mode: '商调式',
      musicMood: '清肃、空灵、收敛、克制',
      keywords: '清理、边界、秩序、断舍离',
      organZang: '肺',
      organFu: '大肠',
      sense: '鼻',
      tissue: '皮 / 皮毛',
      bloom: '毛',
      fluid: '涕',
      emotion: '悲 / 忧',
      spirit: '魄',
      voice: '哭',
      imbalance: '悲伤、失落、压抑、孤独',
      transform: '从沉重到释放',
      virtue: '义',
      virtueFeel: '清正之德',
      beast: '白虎',
      star: '太白',
      gan: '庚辛',
      zhi: '申酉',
      gua: '乾、兑',
      timeFeel: '傍晚、收束',
      spaceFeel: '月光、金石、白墙、秋风',
      imagery: '白瓷、金属、留白、秋景',
      mnemonic: '金主收敛，音为商，脏为肺，志为悲，色为白，季为秋。'
    },
    tracks: [
      { id: 10, title: '白露秋霜', duration: '44:30', durationSec: 2670, hz: '741Hz', tag: '助眠减压', plays: '14.6k', audioUrl: AUDIO_PLACEHOLDER, isPremium: false, previewSec: PREVIEW_SEC },
      { id: 11, title: '金风玉露', duration: '37:00', durationSec: 2220, hz: '商调', tag: '空灵清肃', plays: '9.4k', audioUrl: AUDIO_PLACEHOLDER, isPremium: true },
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
    quality: '收藏',
    desc: '深沉幽远 · 静谧内省',
    sleepTip: '羽音像夜里的水，适合慢下来，往内走。从焦虑到沉静，一路归藏。',
    meta: {
      temperament: '下行、收藏、滋润',
      direction: '北',
      climate: '寒',
      phase: '藏',
      colorName: '黑 / 玄',
      taste: '咸',
      smell: '腐',
      notation: '6 / la',
      mode: '羽调式',
      musicMood: '深沉、幽远、静谧、内省',
      keywords: '入静、沉潜、睡前、归藏',
      organZang: '肾',
      organFu: '膀胱',
      sense: '耳',
      tissue: '骨',
      bloom: '发',
      fluid: '唾',
      emotion: '恐 / 惊',
      spirit: '志',
      voice: '呻',
      imbalance: '恐惧、不安、无力、退缩',
      transform: '从焦虑到沉静',
      virtue: '智',
      virtueFeel: '深藏之德',
      beast: '玄武',
      star: '辰星',
      gan: '壬癸',
      zhi: '亥子',
      gua: '坎',
      timeFeel: '夜晚、收藏',
      spaceFeel: '水面、夜色、深潭、雪、黑瓦',
      imagery: '水波、夜色、黑白、静坐',
      mnemonic: '水主收藏，音为羽，脏为肾，志为恐，色为黑，季为冬。'
    },
    tracks: [
      { id: 13, title: '深海之息', duration: '60:00', durationSec: 3600, hz: '174Hz', tag: '深度睡眠', plays: '22.1k', audioUrl: AUDIO_PLACEHOLDER, isPremium: false, previewSec: PREVIEW_SEC },
      { id: 14, title: '冬雪无声', duration: '48:00', durationSec: 2880, hz: '羽调', tag: '静谧内省', plays: '16.8k', audioUrl: AUDIO_PLACEHOLDER, isPremium: true },
      { id: 15, title: '潜流暗涌', duration: '53:30', durationSec: 3210, hz: '174Hz', tag: '冥想放松', plays: '12.3k', audioUrl: AUDIO_PLACEHOLDER, isPremium: true }
    ]
  }
};

export const ELEMENT_ORDER: ElementId[] = ['木', '火', '土', '金', '水'];

export const ELEMENT_LIST: WuxingElement[] = ELEMENT_ORDER.map((id) => WUXING[id]);

/** 短口诀，用于关于页/结果页的一句话说明（飞书《五音对照知识》主播提示词）。 */
export const WUXING_MNEMONIC = '宫安中，商清肃，角舒展，徵明亮，羽入静。';

/**
 * 免责声明。中医宣称是本项目的合规红线，凡是展示五行/五脏对照的页面都要能看到它。
 * 措辞出自 docs/WUXING-REFERENCE.md 的主播提示词。
 */
export const WUXING_DISCLAIMER =
  '五音、五行、五志、五脏是东方传统文化里的一套象征系统。本应用提供的音乐为放松辅助，不替代医疗诊断与治疗。';
