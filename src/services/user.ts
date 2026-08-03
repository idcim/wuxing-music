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

// 绑定 / 改绑手机号：需先用 scene='bind' 发短信码，连同号码一起提交。
// 后端按用户 JWT 识别身份，无需传 userId。mock 下直接用传入号码模拟成功。
export async function bindPhone(phone: string, code: string): Promise<string> {
  if (USE_MOCK) return phone;
  const res = await request<{ phone: string }>('/api/mp/bind-phone', {
    method: 'POST',
    data: { phone, code }
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

/**
 * 选一张头像图，返回可交给 uploadAvatar 的临时路径；用户取消返回 ''。
 *
 * 小程序端另有 <Button openType="chooseAvatar">（微信原生头像授权，体验更好），
 * 页面优先用它；本函数是 H5 的取图入口，也可作小程序端兜底。
 *
 * H5 下 Taro.chooseImage 会建一个 <input type="file" accept="image/*"> 并以
 * URL.createObjectURL(file) 作 tempFilePath，而 Taro.uploadFile 内部走
 * convertObjectUrlToBlob，正好能吃这个 object URL——两端因此可共用 uploadAvatar。
 */
export async function pickAvatar(): Promise<string> {
  try {
    const res = await Taro.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera']
    });
    return res.tempFilePaths?.[0] || '';
  } catch {
    return ''; // 用户取消
  }
}

// 上传头像文件到后端存储（本地/OSS 透明），返回可访问 URL。
// 取图给的是临时本地路径，必须上传换正式 URL 才能持久化。
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
