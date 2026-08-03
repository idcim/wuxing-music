import Taro from '@tarojs/taro';
import { drawPoster } from './draw';
import { POSTER_H, POSTER_W, type PosterData, type PosterImage } from './types';

/**
 * 小程序出图。用 Canvas 2D（<Canvas type="2d">），与 H5 共用同一份 drawPoster。
 *
 * 相比旧的 createCanvasContext：2D 是标准上下文（绘制代码两端通用）、
 * 可按 pixelRatio 设背板（旧写法导出恒为 1x，视网屏发糊）、且旧接口已被微信标为弃用。
 */

export const POSTER_CANVAS_ID = 'poster-canvas';

interface Canvas2DNode {
  width: number;
  height: number;
  getContext(t: '2d'): CanvasRenderingContext2D;
  createImage(): {
    src: string;
    onload: (() => void) | null;
    onerror: (() => void) | null;
  };
}

/** type="2d" 必须用 selector query 拿真实节点，拿不到就没法画。 */
function getCanvasNode(): Promise<Canvas2DNode> {
  return new Promise((resolve, reject) => {
    Taro.createSelectorQuery()
      .select(`#${POSTER_CANVAS_ID}`)
      .fields({ node: true, size: true })
      .exec((res: any[]) => {
        const node = res?.[0]?.node;
        if (node) resolve(node as Canvas2DNode);
        else reject(new Error('CANVAS_NOT_READY'));
      });
  });
}

/** 远程图先落本地临时文件，再交给 canvas.createImage 解码。 */
function toLocal(url: string): Promise<string> {
  return new Promise((resolve) => {
    Taro.getImageInfo({
      src: url,
      success: (r) => resolve(r.path),
      fail: () => resolve('')
    });
  });
}

function loadImage(canvas: Canvas2DNode, path: string): Promise<PosterImage> {
  return new Promise((resolve, reject) => {
    const img = canvas.createImage();
    img.onload = () => resolve(img as unknown as PosterImage);
    img.onerror = () => reject(new Error('QR_LOAD_FAILED'));
    img.src = path;
  });
}

export async function renderPoster(data: PosterData): Promise<string> {
  const canvas = await getCanvasNode();

  const dpr = Math.min(Math.max(Taro.getSystemInfoSync().pixelRatio || 2, 1), 3);
  canvas.width = POSTER_W * dpr;
  canvas.height = POSTER_H * dpr;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  let qr: PosterImage | null = null;
  if (data.qrUrl) {
    const local = await toLocal(data.qrUrl);
    if (local) qr = await loadImage(canvas, local);
  }

  drawPoster(ctx, data, qr);

  const res = await Taro.canvasToTempFilePath({ canvas } as any);
  return res.tempFilePath;
}
