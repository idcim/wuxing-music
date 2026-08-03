import req from './request';

// ── 认证 ──
export const login = (username: string, password: string, captchaId: string, captchaCode: string) =>
  req.post('/api/admin/login', {
    username, password, captcha_id: captchaId, captcha_code: captchaCode
  });
// 登录图形验证码（免鉴权）；一次性消费，验过即作废
export const getCaptcha = () => req.get('/api/admin/captcha');
export const getMe = () => req.get('/api/admin/me');
export const getDashboard = () => req.get('/api/admin/dashboard');

// ── 用户 ──
export const listUsers = (params: any) => req.get('/api/admin/users', { params });
export const getUser = (id: number) => req.get(`/api/admin/users/${id}`);
export const grantMembership = (id: number, data: any) => req.post(`/api/admin/users/${id}/grant`, data);

// ── 订单 ──
export const listOrders = (params: any) => req.get('/api/admin/orders', { params });
export const getOrder = (id: number) => req.get(`/api/admin/orders/${id}`);
export const refundOrder = (id: number, data: any) => req.post(`/api/admin/orders/${id}/refund`, data);
export const confirmRefund = (id: number) => req.post(`/api/admin/orders/${id}/refund/confirm`);

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
export const migrateStorage = (rewrite_db = true) =>
  req.post('/api/admin/settings/storage/migrate', { rewrite_db });

// ── 小程序配置 ──
export const getMpSetting = () => req.get('/api/admin/settings/mp');
export const updateMpSetting = (data: any) => req.put('/api/admin/settings/mp', data);

// ── 公众号配置（H5 网页授权/JSSDK/JSAPI 支付 appid）──
export const getOaSetting = () => req.get('/api/admin/settings/oa');
export const updateOaSetting = (data: any) => req.put('/api/admin/settings/oa', data);

// ── 短信配置 ──
export const getSmsSetting = () => req.get('/api/admin/settings/sms');
export const updateSmsSetting = (data: any) => req.put('/api/admin/settings/sms', data);

// ── 代理分成（模块默认关闭；未开启时以下接口一律 404）──
export const getAgentSetting = () => req.get('/api/admin/settings/agent');
export const updateAgentSetting = (data: any) => req.put('/api/admin/settings/agent', data);

export const listAgents = (params: any) => req.get('/api/admin/agents', { params });
export const createAgent = (data: any) => req.post('/api/admin/agents', data);
export const updateAgent = (id: number, data: any) => req.put(`/api/admin/agents/${id}`, data);
export const toggleAgent = (id: number) => req.post(`/api/admin/agents/${id}/disable`);
export const agentsSummary = () => req.get('/api/admin/agents-summary');

export const listCommissions = (params: any) => req.get('/api/admin/commissions', { params });

export const listWithdrawals = (params: any) => req.get('/api/admin/withdrawals', { params });
export const approveWithdrawal = (id: number, remark = '') =>
  req.post(`/api/admin/withdrawals/${id}/approve`, { remark });
export const rejectWithdrawal = (id: number, remark = '') =>
  req.post(`/api/admin/withdrawals/${id}/reject`, { remark });
export const markWithdrawalPaid = (id: number, remark = '') =>
  req.post(`/api/admin/withdrawals/${id}/paid`, { remark });

// ── 管理员与角色权限 ──
export const listAdmins = (params: any) => req.get('/api/admin/admins', { params });
export const createAdmin = (data: any) => req.post('/api/admin/admins', data);
export const updateAdmin = (id: number, data: any) => req.put(`/api/admin/admins/${id}`, data);
export const resetAdminPassword = (id: number, password: string) =>
  req.post(`/api/admin/admins/${id}/password`, { password });
export const deleteAdmin = (id: number) => req.delete(`/api/admin/admins/${id}`);

export const listRoles = () => req.get('/api/admin/roles');
export const upsertRole = (data: any) => req.post('/api/admin/roles', data);
export const deleteRole = (id: number) => req.delete(`/api/admin/roles/${id}`);
export const listPermissions = () => req.get('/api/admin/permissions');

// 上传接口地址（el-upload 直传用）
export const UPLOAD_URL = '/api/admin/upload';
// OSS 直传签名：返回 provider='oss' 时带 host/key/policy/signature；
// 未配 OSS 则返回 { provider: 'local' }，调用方回退服务器中转。
export const ossSign = (filename: string) =>
  req.post('/api/admin/upload/oss-sign', { filename });
