import { useEffect, useRef, useState } from 'react';
import { View, Text } from '@tarojs/components';
import { useRouter } from '@tarojs/taro';
import audioService from '@/services/audio';
import { fetchElements, getPlayUrl } from '@/services/content';
import { resolveUrl } from '@/utils/url';
import Icon from '@/components/Icon';
import './index.scss';

// PC 微信小程序的音频运行时是坏的（BGM 假 onPlay + 10004，InnerAudioContext
// 解不了大文件），PC 端由小程序 web-view 内嵌本页播放——完整浏览器内核，
// 通用 MP3/AAC/WAV 都能放。也支持 ?url= 直放任意音频做对照实验。
export default function H5Play() {
  const router = useRouter();
  const [title, setTitle] = useState('加载中…');
  const [state, setState] = useState<'loading' | 'ready' | 'playing' | 'error'>('loading');
  const [note, setNote] = useState('');
  const [progress, setProgress] = useState(0);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  // 准备好的音源；浏览器的自动播放策略要求 load 发生在用户手势里，所以先存后点
  const prepared = useRef<{ url: string; title: string } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    void prepare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function prepare() {
    try {
      if (router.params.url) {
        // 对照实验：直放任意音频地址（如公共测试 MP3）
        prepared.current = { url: String(router.params.url), title: '测试音频' };
        setTitle('测试音频');
      } else {
        const id = Number(router.params.id);
        const els = await fetchElements();
        const track = els.flatMap((e) => e.tracks).find((t) => t.id === id);
        if (!track) throw new Error('曲目不存在');
        setTitle(track.title);
        const r = await getPlayUrl(id, 'aac');
        if (r.preview) setNote('试听片段 · 完整版请在小程序内开通会员');
        prepared.current = { url: resolveUrl(r.url), title: track.title };
      }
      setState('ready');
    } catch (e: any) {
      setState('error');
      setNote(e?.message || '加载失败');
    }
  }

  const toggle = () => {
    if (state === 'playing') {
      audioService.pause();
      return;
    }
    if (!started.current && prepared.current) {
      started.current = true;
      audioService.load(prepared.current.url, { title: prepared.current.title }, {
        onPlay: () => setState('playing'),
        onPause: () => setState('ready'),
        onEnded: () => setState('ready'),
        onError: () => {
          setState('error');
          setNote('音频加载失败');
        },
        onTimeUpdate: (c, d) => {
          setCur(c);
          setDur(d || 0);
          setProgress(d ? (c / d) * 100 : 0);
        }
      });
      return;
    }
    audioService.play();
  };

  const fmtT = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <View className="h5play">
      <Text className="h5play__eyebrow">WUXING SOUND · 网页播放</Text>
      <Text className="h5play__title">{title}</Text>
      {!!note && <Text className="h5play__note">{note}</Text>}
      {state !== 'error' && (
        <>
          <View
            className={`h5play__btn ${state === 'loading' ? 'h5play__btn--disabled' : ''}`}
            onClick={() => state !== 'loading' && toggle()}
          >
            <Icon name={state === 'playing' ? 'pause' : 'play'} size={56} color="#0a0e1a" strokeWidth={2} />
          </View>
          <Text className="h5play__btn-label">
            {state === 'loading' ? '加载中…' : state === 'playing' ? '暂停' : '播放'}
          </Text>
          <View className="h5play__progress">
            <View className="h5play__progress-fill" style={{ width: `${progress}%` }} />
          </View>
          <Text className="h5play__time">{fmtT(cur)} / {fmtT(dur)}</Text>
        </>
      )}
    </View>
  );
}
