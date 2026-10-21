// 本地联调：关闭 mock，直连本地 Docker 后端（localhost:8000）。
// 演示/无后端时改回 true。
export const USE_MOCK = false;

// H5 走容器内 nginx 同源反代 /api（相对地址、免 CORS，自包含）。
// 小程序在 .env.local 中配置 TARO_APP_API_BASE。
export const API_BASE =
  process.env.TARO_ENV === 'h5' ? '' : process.env.TARO_APP_API_BASE || '';

export const TOKEN_KEY = 'wx_token';

// MOCK 模式下曲目 audioUrl 为空时，用此公开测试音频联调播放。
// 微信小程序需在「开发设置 → 服务器域名 → downloadFile 合法域名」加入该域名。
export const MOCK_AUDIO_URL =
  'https://web-ext-storage.dcloud.net.cn/uni-app/ForElise.mp3';
