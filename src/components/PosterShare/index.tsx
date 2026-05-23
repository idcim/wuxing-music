import { useState } from 'react';
import { View, Text, Canvas, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { getQrcode } from '@/services/share';
import { WUXING } from '@/constants/wuxing';
import Icon from '@/components/Icon';
import type { ElementId } from '@/types';
import './index.scss';

interface Props {
  open: boolean;
  onClose: () => void;
  element?: ElementId | null;
  title?: string;          // 主标题，如「年藏会员」
  subtitle?: string;       // 副文案
  cdkey?: string;          // 礼物码（买卡送人时显示）
  scene?: string;          // 小程序码 scene
}

const CANVAS_ID = 'poster-canvas';
// 画布像素尺寸（设计稿基准）
const W = 600;
const H = 960;

export default function PosterShare({
  open, onClose, element, title = '五行律音', subtitle = '按体质定制的助眠音律', cdkey, scene
}: Props) {
  const el = WUXING[(element as ElementId) || '木'];
  const [poster, setPoster] = useState('');   // 生成后的图片临时路径
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);  // 防止重复绘制

  // hex -> rgba
  const rgba = (hex: string, a: number) => {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  };

  // 下载图片为本地路径（canvas drawImage 需要本地路径）
  const toLocal = (url: string): Promise<string> =>
    new Promise((resolve) => {
      if (!url) return resolve('');
      Taro.getImageInfo({
        src: url,
        success: (r) => resolve(r.path),
        fail: () => resolve('')
      });
    });

  const draw = async () => {
    setLoading(true);
    setPoster('');
    try {
      const qrUrl = await getQrcode(scene || '', 'pages/home/index');
      const qrLocal = await toLocal(qrUrl);

      const ctx = Taro.createCanvasContext(CANVAS_ID);

      // 背景：深色渐变
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#0a1018');
      grad.addColorStop(1, '#03050a');
      ctx.setFillStyle(grad as any);
      ctx.fillRect(0, 0, W, H);

      // 顶部五行光晕
      ctx.setFillStyle(rgba(el.primary, 0.14));
      ctx.beginPath();
      ctx.arc(W / 2, 150, 220, 0, Math.PI * 2);
      ctx.fill();

      // 五行大字
      ctx.setFillStyle(el.primary);
      ctx.setFontSize(140);
      ctx.setTextAlign('center');
      ctx.fillText(el.id, W / 2, 230);

      // 英文小标
      ctx.setFillStyle(rgba(el.accent, 0.9));
      ctx.setFontSize(26);
      ctx.fillText(`${el.en} · ${el.notePinyin}`, W / 2, 290);

      // 主标题
      ctx.setFillStyle('#e2e8f0');
      ctx.setFontSize(48);
      ctx.fillText(title, W / 2, 380);

      // 副文案
      ctx.setFillStyle('#94a3b8');
      ctx.setFontSize(26);
      ctx.fillText(subtitle, W / 2, 430);

      // 礼物码（可选）
      let qrTop = 560;
      if (cdkey) {
        ctx.setFillStyle(rgba(el.primary, 0.12));
        ctx.fillRect(80, 480, W - 160, 90);
        ctx.setFillStyle(el.accent);
        ctx.setFontSize(22);
        ctx.fillText('礼物兑换码', W / 2, 512);
        ctx.setFillStyle('#e2e8f0');
        ctx.setFontSize(34);
        ctx.fillText(cdkey, W / 2, 552);
        qrTop = 610;
      }

      // 小程序码
      const qrSize = 220;
      const qrX = (W - qrSize) / 2;
      if (qrLocal) {
        // 白底圆角衬底
        ctx.setFillStyle('#ffffff');
        ctx.fillRect(qrX - 16, qrTop - 16, qrSize + 32, qrSize + 32);
        ctx.drawImage(qrLocal, qrX, qrTop, qrSize, qrSize);
      } else {
        ctx.setFillStyle(rgba('#ffffff', 0.06));
        ctx.fillRect(qrX, qrTop, qrSize, qrSize);
        ctx.setFillStyle('#64748b');
        ctx.setFontSize(22);
        ctx.fillText('扫码体验', W / 2, qrTop + qrSize / 2);
      }

      // 底部提示
      ctx.setFillStyle('#64748b');
      ctx.setFontSize(24);
      ctx.fillText('长按识别 · 开启你的助眠音律', W / 2, qrTop + qrSize + 56);

      await new Promise<void>((resolve) => ctx.draw(false, () => resolve()));

      const res = await Taro.canvasToTempFilePath({
        canvasId: CANVAS_ID,
        width: W,
        height: H,
        destWidth: W * 2,
        destHeight: H * 2
      });
      setPoster(res.tempFilePath);
    } catch (e) {
      console.error('[poster]', e);
      Taro.showToast({ title: '海报生成失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  };

  // 弹层打开时只绘制一次
  if (open && !started) {
    setStarted(true);
    setTimeout(draw, 80);   // 延迟确保 canvas 已挂载
  }

  const savePoster = () => {
    if (!poster) return;
    Taro.saveImageToPhotosAlbum({
      filePath: poster,
      success: () => Taro.showToast({ title: '已保存到相册', icon: 'success' }),
      fail: (err) => {
        if (String(err.errMsg).includes('auth')) {
          Taro.showModal({
            title: '需要相册权限',
            content: '请在设置中开启保存到相册的权限',
            confirmText: '去设置',
            success: (r) => r.confirm && Taro.openSetting()
          });
        } else {
          Taro.showToast({ title: '保存失败', icon: 'none' });
        }
      }
    });
  };

  const close = () => {
    setPoster('');
    setStarted(false);
    onClose();
  };

  if (!open) return null;

  return (
    <View className="poster-mask" onClick={close}>
      <View className="poster" onClick={(e) => e.stopPropagation()}>
        <View className="poster__close" onClick={close}>
          <Icon name="x" size={28} color="#94a3b8" strokeWidth={2} />
        </View>

        {/* 离屏画布：定位到屏幕外但保持可绘制 */}
        <Canvas
          canvasId={CANVAS_ID}
          className="poster__canvas"
          style={{ width: `${W}px`, height: `${H}px` }}
        />

        {loading && (
          <View className="poster__loading">
            <View className="poster__spinner" />
            <Text className="poster__loading-text">海报生成中…</Text>
          </View>
        )}

        {!!poster && (
          <Image className="poster__img" src={poster} mode="widthFix" showMenuByLongpress />
        )}

        <View className="poster__actions">
          <View className="poster__btn poster__btn--save" onClick={savePoster}>
            <Icon name="download" size={28} color="#0a0e1a" strokeWidth={2} />
            <Text className="poster__btn-text poster__btn-text--dark">保存到相册</Text>
          </View>
        </View>
        <Text className="poster__tip">保存后转发给好友，一起听五行律音</Text>
      </View>
    </View>
  );
}
