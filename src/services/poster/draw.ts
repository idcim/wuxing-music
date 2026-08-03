import { WUXING } from '@/constants/wuxing';
import type { ElementId } from '@/types';
import { POSTER_H, POSTER_W, type PosterData, type PosterImage } from './types';

/**
 * 海报绘制：**纯函数，只用标准 Canvas 2D API**，小程序与 H5 共用同一份。
 *
 * 不要在这里 import Taro——两端的取画布/出图差异都在 index.weapp.ts / index.h5.ts 里，
 * 保持本文件零平台依赖，才能用 esbuild 单独打包出来在浏览器里预览版式。
 *
 * ⚠️ 每次 fillText 前都显式设一次 ctx.font。这既是 2D 的正常写法，
 * 也是在防旧画布 API 那个坑——那边 setFontSize 是立即生效、fillText 却入队回放，
 * 结果所有文字都用了最后一次设的字号（H5 上整张海报的字全变成 24px）。
 */

const SERIF = '"Songti SC", STSong, SimSun, serif';
const SANS = '"PingFang SC", system-ui, -apple-system, "Helvetica Neue", sans-serif';

const FRAME = 24;        // 外框内缩
const PAD = 56;          // 内容安全边距
const CARD_RADIUS = 36;
const QR_SIZE = 200;

// ── 小工具 ──

/** hex → rgba。 */
export function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** 圆角矩形路径。自己用 arcTo 画——小程序 2D 不保证有 ctx.roundRect。 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 带投影地画一段，画完复位——否则辉光会污染后续所有绘制。 */
function withShadow(
  ctx: CanvasRenderingContext2D,
  opts: { color: string; blur: number; offsetY?: number },
  fn: () => void
): void {
  ctx.save();
  ctx.shadowColor = opts.color;
  ctx.shadowBlur = opts.blur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = opts.offsetY || 0;
  fn();
  ctx.restore();
}

/** 超宽则截断加省略号。修掉长标题直接画出画布的问题。 */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) {
    s = s.slice(0, -1);
  }
  return s + '…';
}

/** 按宽度折行，超出 maxLines 的部分在最后一行截断。 */
function wrapText(
  ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number
): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width > maxW && cur) {
      lines.push(cur);
      cur = ch;
      if (lines.length === maxLines - 1) break;
    } else {
      cur += ch;
    }
  }
  const rest = text.slice(lines.join('').length);
  lines.push(lines.length === maxLines - 1 ? fitText(ctx, rest, maxW) : cur);
  return lines.filter(Boolean).slice(0, maxLines);
}

/** 固定种子的伪随机：星点每次渲染位置一致，不会每次生成都在跳。 */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// ── 主绘制 ──

export function drawPoster(
  ctx: CanvasRenderingContext2D,
  data: PosterData,
  qr?: PosterImage | null
): void {
  const el = WUXING[(data.element as ElementId) || '木'];
  const W = POSTER_W;
  const H = POSTER_H;
  const cx = W / 2;
  const innerW = W - PAD * 2;

  // ── 背景 ──
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0b1220');
  bg.addColorStop(0.55, '#060a12');
  bg.addColorStop(1, '#03050a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 顶部五行光晕（径向渐变，比原来的实心圆自然得多）
  const glow = ctx.createRadialGradient(cx, 230, 0, cx, 230, 310);
  glow.addColorStop(0, rgba(el.primary, 0.22));
  glow.addColorStop(0.55, rgba(el.primary, 0.07));
  glow.addColorStop(1, rgba(el.primary, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 520);

  // 星点
  const rnd = seeded(20260804);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W;
    const y = rnd() * H * 0.72;
    const r = rnd() * 1.8 + 0.6;
    ctx.fillStyle = `rgba(255,255,255,${(rnd() * 0.1 + 0.04).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 外框：一圈极淡描边，让海报有"成品"边界感
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  roundRect(ctx, FRAME, FRAME, W - FRAME * 2, H - FRAME * 2, 40);
  ctx.stroke();

  // ── 自下而上定位：品牌条 → 二维码卡片 → 礼物码 → 上部块 ──
  // 卡片吸附在底部，上部块在剩余空间里居中。
  // 这样有没有礼物码都不会像原来那样在底部留一大片空白。
  const brandY = H - 54;
  const captionH = 30;
  const qrPlateSize = QR_SIZE + 28;                      // 白底衬垫
  const cardH = 34 + qrPlateSize + 20 + captionH + 30;
  const cardTop = brandY - 40 - cardH;
  const cardX = PAD;
  const cardW = innerW;

  let plateTop = 0;
  const plateH = 96;
  if (data.cdkey) plateTop = cardTop - 30 - plateH;

  const contentBottom = (data.cdkey ? plateTop : cardTop) - 44;

  // ── 上部块：五行大字 + 音名徽章 + 标题 + 副标题 ──
  // 没有礼物码时内容少一块，就把大字放大、间距放宽，让上部块自然撑起来；
  // 否则文案与卡片之间会空出一条明显的暗带（改版前正是这个毛病）。
  const glyphSize = data.cdkey ? 104 : 136;
  const badgeGap = data.cdkey ? 38 : 46;
  ctx.font = `${24}px ${SANS}`;
  const subLines = wrapText(ctx, data.subtitle || '', innerW - 20, 2);

  const badgeH = 46;
  const blockH =
    glyphSize * 1.02 + 20 + badgeH + badgeGap + 46 + 14 + subLines.length * 36;
  const topStart = Math.max(88, (contentBottom - blockH) / 2 + 20);

  let y = topStart;

  // 五行大字
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const glyphCy = y + (glyphSize * 1.02) / 2;
  withShadow(ctx, { color: rgba(el.primary, 0.55), blur: 46 }, () => {
    ctx.fillStyle = el.primary;
    ctx.font = `${glyphSize}px ${SERIF}`;
    ctx.fillText(el.id, cx, glyphCy);
  });
  y += glyphSize * 1.02 + 20;

  // 音名徽章（胶囊）
  ctx.font = `20px ${SANS}`;
  const badgeText = `${el.en} · ${el.note}调 · ${el.quality}`;
  const badgeW = ctx.measureText(badgeText).width + 56;
  roundRect(ctx, cx - badgeW / 2, y, badgeW, badgeH, badgeH / 2);
  ctx.fillStyle = rgba(el.primary, 0.1);
  ctx.fill();
  ctx.strokeStyle = rgba(el.accent, 0.35);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = rgba(el.accent, 0.95);
  ctx.font = `20px ${SANS}`;
  ctx.fillText(badgeText, cx, y + badgeH / 2 + 1);
  y += badgeH + badgeGap;

  // 主标题
  ctx.fillStyle = '#e8eef7';
  ctx.font = `42px ${SERIF}`;
  ctx.fillText(fitText(ctx, data.title || '五行律音', innerW), cx, y + 23);
  y += 46 + 14;

  // 副标题
  ctx.fillStyle = '#8fa0b5';
  ctx.font = `24px ${SANS}`;
  subLines.forEach((line, i) => {
    ctx.fillText(line, cx, y + 18 + i * 36);
  });

  // ── 礼物码牌 ──
  if (data.cdkey) {
    roundRect(ctx, PAD, plateTop, innerW, plateH, 24);
    ctx.fillStyle = rgba(el.primary, 0.1);
    ctx.fill();
    ctx.strokeStyle = rgba(el.accent, 0.28);
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = rgba(el.accent, 0.9);
    ctx.font = `18px ${SANS}`;
    ctx.fillText('礼物兑换码', cx, plateTop + 28);
    ctx.fillStyle = '#e8eef7';
    ctx.font = `32px ${SANS}`;
    ctx.fillText(fitText(ctx, data.cdkey, innerW - 48), cx, plateTop + 66);
  }

  // ── 二维码卡片（浮起） ──
  withShadow(ctx, { color: 'rgba(0,0,0,0.45)', blur: 40, offsetY: 14 }, () => {
    roundRect(ctx, cardX, cardTop, cardW, cardH, CARD_RADIUS);
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.fill();
  });
  roundRect(ctx, cardX, cardTop, cardW, cardH, CARD_RADIUS);
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 白底衬垫 + 二维码
  const plateX = cx - qrPlateSize / 2;
  const plateY = cardTop + 34;
  roundRect(ctx, plateX, plateY, qrPlateSize, qrPlateSize, 20);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  const qrX = cx - QR_SIZE / 2;
  const qrY = plateY + (qrPlateSize - QR_SIZE) / 2;
  if (qr) {
    ctx.drawImage(qr, qrX, qrY, QR_SIZE, QR_SIZE);
  } else {
    // 没取到码也要画得体面，别留一块空白
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(qrX, qrY, QR_SIZE, QR_SIZE);
    ctx.fillStyle = '#94a3b8';
    ctx.font = `20px ${SANS}`;
    ctx.fillText('二维码生成中', cx, qrY + QR_SIZE / 2);
  }

  // 卡片内说明
  ctx.fillStyle = '#94a3b8';
  ctx.font = `22px ${SANS}`;
  ctx.fillText('长按识别 · 开启你的助眠音律', cx, plateY + qrPlateSize + 20 + captionH / 2);

  // ── 底部品牌条 ──
  ctx.fillStyle = 'rgba(226,232,240,0.5)';
  ctx.font = `20px ${SERIF}`;
  ctx.fillText('五行律音 · 安神助眠音律', cx, brandY);
}
