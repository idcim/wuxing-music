import { USE_MOCK } from '@/constants/env';
import { request } from '@/services/api';
import type { ElementId, ElementScores } from '@/types';

// 提交测评结果到后端（mock 模式下静默成功，仅依赖本地存储）
export async function submitQuiz(element: ElementId, scores: ElementScores): Promise<void> {
  if (USE_MOCK) return;
  await request<void>('/api/user/quiz', {
    method: 'POST',
    data: { element, scores }
  });
}
