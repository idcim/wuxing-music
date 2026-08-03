// 默认导出（type-check 与未匹配平台的兜底）。
// 构建时 Taro 会优先选用 index.weapp.ts / index.h5.ts。
export type { PosterData, PosterImage, RenderPoster } from './types';
export { POSTER_W, POSTER_H } from './types';
export { renderPoster, POSTER_CANVAS_ID } from './index.weapp';
