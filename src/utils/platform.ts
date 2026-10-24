import Taro from '@tarojs/taro';

export const PLATFORM = process.env.TARO_ENV;

export const isWeapp = PLATFORM === 'weapp';
export const isRN = PLATFORM === 'rn';
export const isH5 = PLATFORM === 'h5';

// 是否运行在微信内置浏览器（仅 H5 端有意义，决定是否走公众号网页授权 / JSSDK）。
// SSR 或无 navigator 环境需做存在性保护，否则会抛错。
export const isInWeChat =
  isH5 &&
  typeof navigator !== 'undefined' &&
  /micromessenger/i.test(navigator.userAgent);

// 小程序是否跑在 PC 微信（Windows/Mac）。PC 端音频只信 16-bit PCM WAV
// （WebAudio 无 MP3/AAC 私有解码器、解不了 24-bit WAV），选播放副本时用。
export const isPcWechat =
  isWeapp &&
  (() => {
    try {
      const info = Taro.getDeviceInfo ? Taro.getDeviceInfo() : Taro.getSystemInfoSync();
      return info.platform === 'windows' || info.platform === 'mac';
    } catch {
      return false;
    }
  })();

export { Taro };
