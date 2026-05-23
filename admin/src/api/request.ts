import axios from 'axios';
import { ElMessage } from 'element-plus';
import router from '@/router';

const instance = axios.create({
  baseURL: '/',
  timeout: 15000
});

// 请求拦截：带 token
instance.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截：解包 {code,data,msg}，统一错误提示
instance.interceptors.response.use(
  (res) => {
    const body = res.data;
    if (body && typeof body.code !== 'undefined') {
      if (body.code === 0) return body.data;
      ElMessage.error(body.msg || '请求失败');
      return Promise.reject(new Error(body.msg));
    }
    return body;
  },
  (err) => {
    const status = err.response?.status;
    const msg = err.response?.data?.msg || err.message || '网络错误';
    if (status === 401) {
      localStorage.removeItem('admin_token');
      router.push('/login');
      ElMessage.error('登录已过期，请重新登录');
    } else {
      ElMessage.error(msg);
    }
    return Promise.reject(err);
  }
);

// 拦截器已把响应解包为业务 data，故方法返回 Promise<any>。
// 用一层封装让 TS 类型与运行时一致（否则会被推断成 AxiosResponse）。
const request = {
  get: <T = any>(url: string, config?: any): Promise<T> => instance.get(url, config),
  post: <T = any>(url: string, data?: any, config?: any): Promise<T> => instance.post(url, data, config),
  put: <T = any>(url: string, data?: any, config?: any): Promise<T> => instance.put(url, data, config),
  delete: <T = any>(url: string, config?: any): Promise<T> => instance.delete(url, config)
};

export default request;
