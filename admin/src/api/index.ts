import req from './request';

// ── 认证 ──
export const login = (username: string, password: string) =>
  req.post('/api/admin/login', { username, password });
export const getMe = () => req.get('/api/admin/me');
export const getDashboard = () => req.get('/api/admin/dashboard');

// ── 用户 ──
export const listUsers = (params: any) => req.get('/api/admin/users', { params });

// ── 套餐 ──
export const listPlans = () => req.get('/api/admin/plans');
export const upsertPlan = (data: any) => req.post('/api/admin/plans', data);
export const deletePlan = (id: string) => req.delete(`/api/admin/plans/${id}`);

// ── 五行 ──
export const listElements = () => req.get('/api/admin/elements');
export const upsertElement = (data: any) => req.post('/api/admin/elements', data);
export const deleteElement = (id: string) => req.delete(`/api/admin/elements/${id}`);

// ── 歌曲 ──
export const listTracks = (params: any) => req.get('/api/admin/tracks', { params });
export const createTrack = (data: any) => req.post('/api/admin/tracks', data);
export const updateTrack = (id: number, data: any) => req.put(`/api/admin/tracks/${id}`, data);
export const deleteTrack = (id: number) => req.delete(`/api/admin/tracks/${id}`);

// ── CDKEY ──
export const listCdkeys = (params: any) => req.get('/api/admin/cdkeys', { params });
export const generateCdkeys = (data: any) => req.post('/api/admin/cdkeys/generate', data);
export const disableCdkey = (id: number) => req.post(`/api/admin/cdkeys/${id}/disable`);

// ── 测评 ──
export const listQuiz = () => req.get('/api/admin/quiz');
export const createQuiz = (data: any) => req.post('/api/admin/quiz', data);
export const updateQuiz = (id: number, data: any) => req.put(`/api/admin/quiz/${id}`, data);
export const deleteQuiz = (id: number) => req.delete(`/api/admin/quiz/${id}`);

// ── 支付设置 ──
export const getPaySetting = () => req.get('/api/admin/settings/pay');
export const updatePaySetting = (data: any) => req.put('/api/admin/settings/pay', data);

// ── 站点设置 ──
export const getSiteSetting = () => req.get('/api/admin/settings/site');
export const updateSiteSetting = (data: any) => req.put('/api/admin/settings/site', data);

// ── 存储设置 ──
export const getStorageSetting = () => req.get('/api/admin/settings/storage');
export const updateStorageSetting = (data: any) => req.put('/api/admin/settings/storage', data);

// 上传接口地址（el-upload 直传用）
export const UPLOAD_URL = '/api/admin/upload';
