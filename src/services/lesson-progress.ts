// 同一账号、章节的请求串行，防止旧请求晚到覆盖暂停时保存的位置。
const pending = new Map<string, Promise<void>>();

export async function waitForLessonProgress(owner: string, lesson: number) {
  // 重进章节前等待旧播放器的最后一次保存；失败时由调用方展示重试。
  await pending.get(`${owner}:${lesson}`);
}

export function createLessonProgress(options: {
  owner: string;
  lesson: number;
  position: number;
  duration: number;
  currentOwner: () => string | undefined;
  send: (lesson: number, position: number) => Promise<unknown>;
  onError: () => void;
}) {
  const key = `${options.owner}:${options.lesson}`;
  let position = options.position || 0;
  let reported = position;
  let active = true;
  const save = () => {
    const snapshot = Math.floor(position);
    const previous = pending.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      if (options.currentOwner() !== options.owner) return;
      await options.send(options.lesson, snapshot);
    });
    pending.set(key, next);
    void next.catch(options.onError).finally(() => {
      if (pending.get(key) === next) pending.delete(key);
    });
    return next;
  };
  return {
    get active() { return active; },
    get position() { return position; },
    save,
    update(time: number) {
      if (!active || !Number.isFinite(time)) return;
      position = Math.max(0, Math.min(time, options.duration || time));
      if (Math.abs(position - reported) >= 10) {
        reported = position;
        void save().catch(() => {});
      }
    },
    close() {
      active = false;
      return save();
    },
  };
}
