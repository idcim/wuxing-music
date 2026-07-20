import Taro from '@tarojs/taro';
import { API_BASE, TOKEN_KEY } from '@/constants/env';
import { storage } from '@/services/storage';

export interface ApiResponse<T> {
  code: number;
  data: T;
  msg?: string;
}

export class ApiError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  data?: Record<string, unknown>;
  auth?: boolean;            // 是否携带 token，默认 true
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', data, auth = true } = opts;
  const header: Record<string, string> = { 'content-type': 'application/json' };

  if (auth) {
    const token = storage.get<string>(TOKEN_KEY);
    if (token) header['Authorization'] = `Bearer ${token}`;
  }

  const res = await Taro.request({
    url: `${API_BASE}${path}`,
    method,
    data,
    header
  });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    // 优先用后端返回体里的 msg 作为错误信息（如「验证码错误」「密码不正确」），
    // 回退到通用 HTTP 文案；code 仍用 statusCode 便于上层按 401 等分支处理。
    const errBody = res.data as ApiResponse<T> | undefined;
    throw new ApiError(res.statusCode, errBody?.msg || `HTTP ${res.statusCode}`);
  }

  const body = res.data as ApiResponse<T>;
  if (body.code !== 0) {
    throw new ApiError(body.code, body.msg || `业务错误 ${body.code}`);
  }
  return body.data;
}
