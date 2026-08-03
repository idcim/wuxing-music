import { drawPoster } from './draw';
import { POSTER_H, POSTER_W, type PosterData, type PosterImage } from './types';

/**
 * H5 出图。直接拿真实的 <canvas> 用标准 2D 上下文画，不走 Taro 的旧画布 API。
 *
 * 旧写法（createCanvasContext + ctx.draw 回放）在 H5 上有个致命错位：
 * setFontSize/setTextAlign 是**立即**写 ctx 的，fillText 却是**入队**等回放的，
 * 于是回放时所有文字都用了最后一次设的字号——整张海报的字全变成 24px。
 * 2D 是立即模式，没有队列，这个坑从根上不存在。
 */

export const POSTER_CANVAS_ID = 'poster-canvas';

function findCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  // Taro 的 Canvas 组件把 canvasId 落在宿主的 id 上、内层 <canvas> 的 canvas-id 上，
  // 两种写法都兜住，免得升级 Taro 后选择器失效。
  const host = document.getElementById(POSTER_CANVAS_ID);
  return (
    (host?.querySelector('canvas') as HTMLCanvasElement | null) ||
    (document.querySelector(
      `canvas[canvas-id="${POSTER_CANVAS_ID}"]`
    ) as HTMLCanvasElement | null)
  );
}

function loadImage(url: string): Promise<PosterImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // crossOrigin 必须在赋 src 之前设。同源（/uploads 反代）下是无害的；
    // 跨域（OSS）时若桶没配 CORS 会直接加载失败——这比"加载成功但污染画布、
    // 到 toDataURL 才炸"更早也更好定位。
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('QR_LOAD_FAILED'));
    img.src = url;
  });
}

export async function renderPoster(data: PosterData): Promise<string> {
  const canvas = findCanvas();
  if (!canvas) throw new Error('CANVAS_NOT_READY');

  const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
  // ⚠️ 必须在这里再设一次背板尺寸：Taro 的 Canvas 组件在 componentDidRender 里
  // 会按计算样式回写 canvas.width/height，早设会被它冲掉。
  canvas.width = POSTER_W * dpr;
  canvas.height = POSTER_H * dpr;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CTX_NOT_READY');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  let qr: PosterImage | null = null;
  if (data.qrUrl) qr = await loadImage(data.qrUrl);

  drawPoster(ctx, data, qr);
  return canvas.toDataURL('image/png');
}
