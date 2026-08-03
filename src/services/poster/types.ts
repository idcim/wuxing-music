import type { ElementId } from '@/types';

/** 海报画布尺寸（逻辑像素）。实际背板会按屏幕倍率放大，绘制时一律用这套坐标。 */
export const POSTER_W = 600;
export const POSTER_H = 960;

export interface PosterData {
  element: ElementId | null;
  title: string;
  subtitle: string;
  cdkey?: string;      // 礼物兑换码（买卡送人时才有）
  qrUrl?: string;      // 二维码图片地址；空则画占位框
}

/**
 * 已解码、可直接 drawImage 的图片。
 * H5 是 HTMLImageElement，小程序 2D 是 canvas.createImage() 的产物，
 * 两者都能喂给 drawImage，但没有公共类型，故此处放宽。
 */
export type PosterImage = CanvasImageSource;

/** 出图：返回可直接用于 <Image src> 的地址（H5 是 dataURL，小程序是临时文件路径）。 */
export type RenderPoster = (data: PosterData) => Promise<string>;
