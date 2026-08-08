import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from '@tarojs/components';
import type { CommonEventFunction, ITouchEvent } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { isH5 } from '@/utils/platform';
import './index.scss';

interface Props {
  duration: number;                 // 总时长（秒），0 表示未知，此时不可拖
  currentTime: number;              // 播放位置（秒）
  buffered: number;                 // 已缓冲到第几秒
  color: string;                    // 主色（跟随当前曲目所属五行）
  onSeek: (sec: number) => void;    // 松手时提交
  onSeeking?: (sec: number | null) => void;  // 拖动中的位置，null 表示结束
}

// createSelectorQuery 需要一个选择器；页面同时只有一条进度轴，用固定 id 即可
const BAR_ID = 'player-seek-bar';

/**
 * 播放进度轴。
 *
 * 为什么不用 Taro 的 `<Slider>`：它在 H5 上基本拖不动，这不是用法问题而是实现所致
 * （见 node_modules/@tarojs/components/.../slider/slider.js）：
 *   1. `componentDidLoad` 只把 touchstart/touchmove/touchend 绑在 **滑块本身**
 *      （`.weui-slider__handler`）上——轨道上点按拖动一概无效，必须精准摁住那个圆点；
 *      而我们传的 blockSize=16，命中区只有 16px。
 *   2. 只绑 touch、**没有任何 mouse/pointer 监听**，所以在桌面浏览器里完全拖不动。
 *   3. `value` 上挂着 watcher，属性一变就 `updateByStep()` 重置内部 percent。
 *      而 onTimeUpdate 每秒推好几次 currentTime，拖到一半就被播放进度拽回去。
 *
 * 本组件：整条轨道都可点可拖、命中区按 48rpx 上下留白放大、拖动期间用本地
 * dragPct 渲染并忽略 currentTime（松手才 seek），H5 另补鼠标拖动。
 */
export default function SeekBar({
  duration, currentTime, buffered, color, onSeek, onSeeking
}: Props) {
  const [dragPct, setDragPct] = useState<number | null>(null);
  // 轨道的位置与宽度。touch/mouse 事件只给绝对坐标，得自己换算成百分比。
  const rect = useRef<{ left: number; width: number } | null>(null);
  // 供 H5 鼠标监听读取最新值（那几个 listener 只注册一次，闭包会过期）
  const durRef = useRef(duration);
  const seekRef = useRef(onSeek);
  const seekingRef = useRef(onSeeking);
  durRef.current = duration;
  seekRef.current = onSeek;
  seekingRef.current = onSeeking;

  // createSelectorQuery 两端通用（H5 下 Taro 也实现了），比分端写 DOM 干净
  const measure = useCallback(() => {
    Taro.createSelectorQuery()
      .select(`#${BAR_ID}`)
      .boundingClientRect((res) => {
        const r = res as unknown as { left: number; width: number } | null;
        if (r && r.width) rect.current = { left: r.left, width: r.width };
      })
      .exec();
  }, []);

  // 首次布局完成后量一次，之后每次交互开始再量（自愈，兼顾旋转/折叠屏）
  useEffect(() => {
    const t = setTimeout(measure, 300);
    return () => clearTimeout(t);
  }, [measure]);

  const pctFromX = useCallback((x: number): number | null => {
    const r = rect.current;
    if (!r || !r.width) return null;
    return Math.max(0, Math.min(1, (x - r.left) / r.width));
  }, []);

  const begin = useCallback((x: number) => {
    measure();
    const p = pctFromX(x);
    if (p === null) return;
    setDragPct(p);
    seekingRef.current?.(p * durRef.current);
  }, [measure, pctFromX]);

  const moveTo = useCallback((x: number) => {
    const p = pctFromX(x);
    if (p === null) return;
    setDragPct(p);
    seekingRef.current?.(p * durRef.current);
  }, [pctFromX]);

  const finish = useCallback((p: number | null) => {
    setDragPct(null);
    seekingRef.current?.(null);
    if (p !== null && durRef.current > 0) seekRef.current(p * durRef.current);
  }, []);

  // ── 触摸（两端通用）──
  // Taro 把 <View> 的 onTouchStart 等一律声明成 CommonEventFunction，
  // 事件类型里没有 touches 字段，只能自己收窄。
  const touchX = (e: unknown): number | null => {
    const { touches, changedTouches } = e as Partial<ITouchEvent>;
    const t = touches?.[0] ?? changedTouches?.[0];
    return t ? t.clientX : null;
  };
  const onTouchStart: CommonEventFunction = (e) => {
    const x = touchX(e);
    if (duration <= 0 || x === null) return;
    begin(x);
  };
  const onTouchMove: CommonEventFunction = (e) => {
    const x = touchX(e);
    if (duration <= 0 || dragPct === null || x === null) return;
    moveTo(x);
  };
  const onTouchEnd = () => {
    if (dragPct === null) return;
    finish(dragPct);
  };

  // ── 鼠标（仅 H5）──
  // Taro 的组件 props 只声明了 touch 系列，没有 mouse，所以用 id 拿真实 DOM 挂监听。
  // 不加这段的话，桌面浏览器里依旧只能点不能拖。
  useEffect(() => {
    if (!isH5) return;
    const el = document.getElementById(BAR_ID);
    if (!el) return;
    let holding = false;
    let last: number | null = null;

    const down = (ev: MouseEvent) => {
      if (durRef.current <= 0) return;
      holding = true;
      measure();
      last = pctFromX(ev.clientX);
      if (last !== null) { setDragPct(last); seekingRef.current?.(last * durRef.current); }
      ev.preventDefault();   // 防止拖动时选中页面文字
    };
    const move = (ev: MouseEvent) => {
      if (!holding) return;
      const p = pctFromX(ev.clientX);
      if (p !== null) { last = p; setDragPct(p); seekingRef.current?.(p * durRef.current); }
    };
    const up = () => {
      if (!holding) return;
      holding = false;
      finish(last);
      last = null;
    };

    el.addEventListener('mousedown', down);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => {
      el.removeEventListener('mousedown', down);
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
  }, [measure, pctFromX, finish]);

  // 拖动中一律以手指位置为准，别让 onTimeUpdate 把进度拽回去
  const playPct = duration > 0 ? Math.min(currentTime, duration) / duration : 0;
  const pct = (dragPct !== null ? dragPct : playPct) * 100;
  const bufPct = duration > 0 ? Math.min(1, buffered / duration) * 100 : 0;

  return (
    <View
      id={BAR_ID}
      className="seekbar"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <View className="seekbar__track">
        <View className="seekbar__buffer" style={{ width: `${bufPct}%` }} />
        <View className="seekbar__fill" style={{ width: `${pct}%`, background: color }} />
      </View>
      <View
        className={`seekbar__thumb${dragPct !== null ? ' seekbar__thumb--on' : ''}`}
        style={{ left: `${pct}%`, background: color }}
      />
    </View>
  );
}
