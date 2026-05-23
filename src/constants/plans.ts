import type { Plan } from '@/types';

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: '听闻',
    en: 'EXPLORE',
    price: 0,
    features: ['每日 3 首试听', '基础五行测评', '30秒曲目预览'],
    limit: true
  },
  {
    id: 'month',
    name: '月悦',
    en: 'MONTHLY',
    price: 18,
    unit: '/ 月',
    badge: '热门',
    features: ['无限曲目播放', '完整五行测评报告', '个性化推荐算法', '离线下载 30首', '睡眠质量追踪']
  },
  {
    id: 'year',
    name: '年藏',
    en: 'ANNUAL',
    price: 128,
    unit: '/ 年',
    original: '216',
    badge: '省 ¥88',
    featured: true,
    features: ['全部月悦权益', '离线下载 无限', '专属导引冥想课', '五行调理方案', '1v1 体质咨询 ×2', '新曲首发优先']
  }
];
