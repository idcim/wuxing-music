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

// 绑定手机号。真实环境由 getPhoneNumber 授权拿到加密数据，服务端解密后落库；
// mock 下直接用传入号码模拟成功。
export async function bindPhone(userId: number, phone: string): Promise<string> {
  if (USE_MOCK) return phone;
  const res = await request<{ phone: string }>('/api/mp/bind-phone', {
    method: 'POST',
    data: { user_id: userId, phone },
    auth: false
  });
  return res.phone;
}
