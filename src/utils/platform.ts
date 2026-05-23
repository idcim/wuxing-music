import Taro from '@tarojs/taro';

export const PLATFORM = process.env.TARO_ENV;

export const isWeapp = PLATFORM === 'weapp';
export const isRN = PLATFORM === 'rn';
export const isH5 = PLATFORM === 'h5';

export { Taro };
