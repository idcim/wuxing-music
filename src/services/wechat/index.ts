// 默认导出（type-check 与未匹配平台的兜底）。
// 构建时 Taro 会优先选用 index.weapp.ts / index.h5.ts。
export type { WechatService, PayParams } from './types';
export { default } from './index.weapp';
