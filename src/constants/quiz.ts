import type { QuizQuestion, ElementScores, ElementId } from '@/types';

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    q: '您平时睡眠状况如何？',
    opts: [
      { text: '难以入睡，思虑过多', score: { 火: 2, 木: 1 } },
      { text: '易醒多梦，心跳加速', score: { 火: 2, 水: 1 } },
      { text: '嗜睡无力，醒后疲乏', score: { 土: 2, 金: 1 } },
      { text: '浅眠易惊，腰酸耳鸣', score: { 水: 2, 金: 1 } }
    ]
  },
  {
    q: '您的情绪状态偏向？',
    opts: [
      { text: '容易焦虑烦躁，情绪波动大', score: { 木: 2, 火: 1 } },
      { text: '喜悦外向，但易过度兴奋', score: { 火: 2 } },
      { text: '多思多虑，难以放下', score: { 土: 2, 木: 1 } },
      { text: '忧郁寡言，悲观失落', score: { 金: 2, 水: 1 } }
    ]
  },
  {
    q: '您身体哪方面最需要调理？',
    opts: [
      { text: '肝胆 · 眼睛 · 筋骨紧张', score: { 木: 3 } },
      { text: '心脏 · 血压 · 头面潮热', score: { 火: 3 } },
      { text: '脾胃 · 消化 · 体重管理', score: { 土: 3 } },
      { text: '肺部 · 皮肤 · 呼吸问题', score: { 金: 3 } },
      { text: '肾脏 · 腰膝 · 精力不足', score: { 水: 3 } }
    ]
  },
  {
    q: '您更偏爱哪种音乐氛围？',
    opts: [
      { text: '清新自然 · 如竹林鸟鸣', score: { 木: 2 } },
      { text: '温暖明亮 · 如炉火轻语', score: { 火: 2 } },
      { text: '沉稳厚重 · 如大地回响', score: { 土: 2 } },
      { text: '空灵清冷 · 如秋月高悬', score: { 金: 2 } },
      { text: '深沉流动 · 如海潮涌动', score: { 水: 2 } }
    ]
  }
];

export const EMPTY_SCORES: ElementScores = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };

// 取最高分元素作为主体质
export function calcTopElement(scores: ElementScores): ElementId {
  return (Object.entries(scores) as [ElementId, number][])
    .sort((a, b) => b[1] - a[1])[0][0];
}
