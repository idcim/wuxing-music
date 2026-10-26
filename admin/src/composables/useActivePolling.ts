import { onActivated, onDeactivated, onMounted, onUnmounted } from 'vue';

/** 兼容普通页面与 KeepAlive；首次 mount/activate 不重复启动，隐藏页停止轮询。 */
export function useActivePolling(callback: () => unknown, interval: number, onPause: () => void = () => {}) {
  let active = false;
  let epoch = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const run = () => {
    const scheduled = epoch;
    Promise.resolve().then(() => { if (active && scheduled === epoch) return callback(); }).catch(() => {});
  };
  const start = () => {
    if (active) return;
    active = true; run(); timer = setInterval(run, interval);
  };
  const stop = () => {
    if (!active) return;
    active = false; epoch++; clearInterval(timer); timer = undefined; onPause();
  };
  onMounted(start); onActivated(start); onDeactivated(stop); onUnmounted(stop);
  return { isActive: () => active };
}
