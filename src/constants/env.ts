// 后端尚未就绪：MOCK 模式下 api/auth 走本地模拟，便于全流程联调。
// 后端上线后将 USE_MOCK 置为 false，并填入真实 API_BASE。
export const USE_MOCK = true;

export const API_BASE = 'https://api.wuxingmusic.com';

export const TOKEN_KEY = 'wx_token';
