import { useEffect, useState } from 'react';
import { View, Text, Canvas, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { getQrcode } from '@/services/share';
import { renderPoster, POSTER_CANVAS_ID } from '@/services/poster';
import { POSTER_H, POSTER_W } from '@/services/poster/types';
import { isWeapp } from '@/utils/platform';
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
  scene?: string;          // 二维码参数（如 a=<推广码>）
}

/**
 * 海报弹层。**只管 UI 与调用**——画布怎么取、怎么按屏幕倍率出图，
 * 都在 services/poster 里分端实现，本文件不碰任何画布 API。
 */
export default function PosterShare({
  open, onClose, element, title = '五行律音', subtitle = '按体质定制的助眠音律', cdkey, scene
}: Props) {
  const [poster, setPoster] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setPoster('');
      return;
    }
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setPoster('');
      try {
        const qrUrl = await getQrcode(scene || '', 'pages/home/index');
        if (cancelled) return;
        // 画布刚挂载，等一帧再取节点（小程序的 selector query 尤其需要）
        await new Promise((r) => setTimeout(r, 80));
        if (cancelled) return;
        const img = await renderPoster({
          element: element || null, title, subtitle, cdkey, qrUrl
        });
        if (!cancelled) setPoster(img);
      } catch (e: any) {
        if (cancelled) return;
        console.error('[poster]', e);
        const msg = String(e?.message || e?.errMsg || '');
        // 二维码跨域是最常见的失败原因：存储切到 OSS 而桶没配 CORS。
        // 单独给一句能指向原因的提示，别笼统报「生成失败」。
        const cors = /QR_LOAD_FAILED|security|taint|cross-origin/i.test(msg);
        Taro.showToast({
          title: cors ? '二维码跨域，无法生成海报' : '海报生成失败',
          icon: 'none',
          duration: 2500
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scene, cdkey, title, subtitle, element]);

  const savePoster = () => {
    if (!poster) return;
    // H5 没有相册可写：Taro 的 saveImageToPhotosAlbum 在 H5 是 <a download> 合成点击，
    // 微信内置浏览器会拦掉，但它**总是回调 success**——会提示「已保存」而其实什么都没存。
    // 浏览器里正确的做法是让用户长按图片调系统菜单保存。
    if (!isWeapp) {
      Taro.showToast({ title: '长按上方图片即可保存', icon: 'none', duration: 2500 });
      return;
    }
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

  if (!open) return null;

  return (
    <View className="poster-mask" onClick={onClose}>
      <View className="poster" onClick={(e) => e.stopPropagation()}>
        <View className="poster__close" onClick={onClose}>
          <Icon name="x" size={28} color="#94a3b8" strokeWidth={2} />
        </View>

        {/* 离屏画布：定位到屏幕外但保持可绘制。
            type="2d" 时取节点靠 id，不是 canvasId。 */}
        <Canvas
          type="2d"
          id={POSTER_CANVAS_ID}
          canvasId={POSTER_CANVAS_ID}
          className="poster__canvas"
          style={{ width: `${POSTER_W}px`, height: `${POSTER_H}px` }}
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
            <Text className="poster__btn-text poster__btn-text--dark">
              {isWeapp ? '保存到相册' : '长按图片保存'}
            </Text>
          </View>
        </View>
        <Text className="poster__tip">
          {isWeapp
            ? '保存后转发给好友，一起听五行律音'
            : '长按图片保存到相册，再转发给好友'}
        </Text>
      </View>
    </View>
  );
}
