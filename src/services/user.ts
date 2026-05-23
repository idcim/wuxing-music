import Taro from '@tarojs/taro';
import { USE_MOCK, API_BASE, TOKEN_KEY } from '@/constants/env';
import { request } from '@/services/api';
import { storage } from '@/services/storage';
import type { ElementId, ElementScores } from '@/types';

// 提交测评结果到后端（mock 模式下静默成功，仅依赖本地存储）
export async function submitQuiz(element: ElementId, scores: ElementScores): Promise<void> {
  if (USE_MOCK) return;
  await request<unknown>('/api/mp/quiz', {
    method: 'POST',
    data: { element, scores }
  });
}

// 绑定手机号。真实环境由 getPhoneNumber 授权拿加密数据，服务端解密后落库；
// mock 下直接用传入号码模拟成功。后端按用户 JWT 识别，无需传 userId。
export async function bindPhone(_userId: number, phone: string): Promise<string> {
  if (USE_MOCK) return phone;
  const res = await request<{ phone: string }>('/api/mp/bind-phone', {
    method: 'POST',
    data: { phone }
  });
  return res.phone;
}

// 更新昵称 / 头像，落库。mock 下原样返回，仅靠本地存储。
export async function updateProfile(
  patch: { nickname?: string; avatar?: string }
): Promise<{ nickname?: string; avatar?: string }> {
  if (USE_MOCK) return patch;
  // 用 POST（后端同时支持 PATCH/POST），规避部分反向代理对 PATCH 返回 405
  const res = await request<{ nickname: string; avatar: string }>('/api/mp/profile', {
    method: 'POST',
    data: patch
  });
  return { nickname: res.nickname, avatar: res.avatar };
}

// 上传头像文件到后端存储（本地/OSS 透明），返回可访问 URL。
// chooseAvatar 给的是临时本地路径，必须上传换正式 URL 才能持久化。
export async function uploadAvatar(filePath: string): Promise<string> {
  if (USE_MOCK) return filePath;
  const token = storage.get<string>(TOKEN_KEY);
  const res = await Taro.uploadFile({
    url: `${API_BASE}/api/mp/upload`,
    filePath,
    name: 'file',
    header: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`上传失败 HTTP ${res.statusCode}`);
  }
  const body = JSON.parse(res.data) as { code: number; data?: { url: string }; msg?: string };
  if (body.code !== 0 || !body.data) {
    throw new Error(body.msg || '上传失败');
  }
  return body.data.url;
}
