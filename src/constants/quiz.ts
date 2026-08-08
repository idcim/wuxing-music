import type { QuizQuestion, ElementScores, ElementId } from '@/types';

/**
 * 五行测评题库。题干口径出自 docs/WUXING-REFERENCE.md 的
 * 「情绪失衡表现 / 情绪转化方向 / 音乐气质 / 适合画面」四行。
 *
 * ⚠️ 不要再写「您身体哪方面最需要调理？肝胆·眼睛·筋骨紧张」这类题——
 * 问身体症状会被平台判为养生医疗问诊。测评只问情绪状态与感受偏好。
 * 后端 backend/app/seed.py::QUIZ 是同一份题库，改动要同步。
 */
export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    q: '夜里睡不着的时候，你更接近哪种状态？',
    opts: [
      { text: '心里绷着一股劲，越想越憋屈', score: { 木: 3 } },
      { text: '脑子停不下来，心神不宁', score: { 火: 3 } },
      { text: '反复想白天的事，纠结放不下', score: { 土: 3 } },
      { text: '一阵阵失落，觉得有点孤单', score: { 金: 3 } },
      { text: '莫名不安，整个人提不起力气', score: { 水: 3 } }
    ]
  },
  {
    q: '你最希望自己往哪个方向走一走？',
    opts: [
      { text: '从郁结到舒展', score: { 木: 3 } },
      { text: '从沉闷到明亮', score: { 火: 3 } },
      { text: '从散乱到安定', score: { 土: 3 } },
      { text: '从沉重到释放', score: { 金: 3 } },
      { text: '从焦虑到沉静', score: { 水: 3 } }
    ]
  },
  {
    q: '哪一种声音氛围最能让你放松？',
    opts: [
      { text: '清新舒展 · 像流动的风', score: { 木: 2 } },
      { text: '明亮温暖 · 像一束光', score: { 火: 2 } },
      { text: '平稳厚重 · 像大地回响', score: { 土: 2 } },
      { text: '空灵清冷 · 像秋夜留白', score: { 金: 2 } },
      { text: '深沉幽远 · 像夜里的水', score: { 水: 2 } }
    ]
  },
  {
    q: '闭上眼，你最先想到的画面是？',
    opts: [
      { text: '竹林春风，一片新绿', score: { 木: 2 } },
      { text: '烛火日光，暖色织物', score: { 火: 2 } },
      { text: '茶席陶器，一方黄土', score: { 土: 2 } },
      { text: '白瓷金石，秋景留白', score: { 金: 2 } },
      { text: '水波夜色，独自静坐', score: { 水: 2 } }
    ]
  }
];

export const EMPTY_SCORES: ElementScores = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };

// 取最高分元素作为主体质
export function calcTopElement(scores: ElementScores): ElementId {
  return (Object.entries(scores) as [ElementId, number][])
    .sort((a, b) => b[1] - a[1])[0][0];
}
