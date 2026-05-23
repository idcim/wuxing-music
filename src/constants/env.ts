// 后端尚未就绪：MOCK 模式下 api/auth 走本地模拟，便于全流程联调。
// 后端上线后将 USE_MOCK 置为 false，并填入真实 API_BASE。
export const USE_MOCK = true;

export const API_BASE = 'https://api.wuxingmusic.com';

export const TOKEN_KEY = 'wx_token';

// MOCK 模式下曲目 audioUrl 为空时，用此公开测试音频联调播放。
// 微信小程序需在「开发设置 → 服务器域名 → downloadFile 合法域名」加入该域名。
export const MOCK_AUDIO_URL =
  'https://web-ext-storage.dcloud.net.cn/uni-app/ForElise.mp3';
