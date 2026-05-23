import { USE_MOCK } from '@/constants/env';
import { request } from '@/services/api';

export interface WeeklyDay {
  date: string;
  label: string;     // 周几（今天为「今」）
  count: number;     // 当天聆听次数
  minutes: number;   // 当天聆听分钟（按曲目时长估算）
  isToday: boolean;
}

export interface WeeklyStats {
  days: WeeklyDay[];
  totalMinutes: number;
  totalHours: number;
}

// 空数据兜底（未登录 / mock / 请求失败时用，保证图表有 7 根柱子）
export function emptyWeekly(): WeeklyStats {
  const labels = ['一', '二', '三', '四', '五', '六', '今'];
  return {
    days: labels.map((label, i) => ({
      date: '',
      label,
      count: 0,
      minutes: 0,
      isToday: i === 6
    })),
    totalMinutes: 0,
    totalHours: 0
  };
}

export async function getWeeklyStats(): Promise<WeeklyStats> {
  if (USE_MOCK) return emptyWeekly();
  try {
    return await request<WeeklyStats>('/api/mp/stats/weekly');
  } catch {
    return emptyWeekly();
  }
}
