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

export { Taro };
