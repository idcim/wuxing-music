// 本地联调：关闭 mock，直连本地 Docker 后端（localhost:8000）。
// 演示/无后端时改回 true；生产部署时把 API_BASE 换成线上地址。
export const USE_MOCK = false;

export const API_BASE = 'http://localhost:8000';

export const TOKEN_KEY = 'wx_token';

// MOCK 模式下曲目 audioUrl 为空时，用此公开测试音频联调播放。
// 微信小程序需在「开发设置 → 服务器域名 → downloadFile 合法域名」加入该域名。
export const MOCK_AUDIO_URL =
  'https://web-ext-storage.dcloud.net.cn/uni-app/ForElise.mp3';
