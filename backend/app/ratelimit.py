"""轻量内存限流：滑动窗口计数 + 失败次数锁定。

用于短信发送、密码登录、CDKEY 兑换等接口的基础防刷（防轰炸/暴力/盗刷）。

设计取舍（从简）：
  - 进程内状态，重启即清空、多 worker/多实例之间不共享。
    单机部署足够；生产多实例需换 Redis 等共享存储（见 ROADMAP 安全清单）。
  - 事件即时间戳列表，读时惰性淘汰过期项，无独立清理线程。

两类用法：
  - 正向限流（如「同 IP 每小时 N 条短信」）：check_and_record(key, limit, window)。
  - 失败锁定（如「密码连错 5 次锁 10 分钟」）：先 fail_count 判断是否超限，
    失败时 record_fail，成功时 clear_fail。
"""
import threading
import time

_lock = threading.Lock()
# key -> 事件时间戳列表（正向限流用）
_hits: dict[str, list[float]] = {}
# key -> 失败时间戳列表（失败锁定用）
_fails: dict[str, list[float]] = {}


def _prune(store: dict[str, list[float]], key: str, window_sec: float) -> tuple[float, list[float]]:
    """淘汰 key 下超出窗口的时间戳，返回 (now, 保留列表)。调用方需持锁。"""
    now = time.time()
    kept = [t for t in store.get(key, []) if now - t < window_sec]
    if kept:
        store[key] = kept
    else:
        store.pop(key, None)
    return now, kept


def check_and_record(key: str, limit: int, window_sec: float) -> bool:
    """滑动窗口正向限流：window_sec 内命中 < limit 则记录并放行，返回是否放行。"""
    with _lock:
        now, kept = _prune(_hits, key, window_sec)
        if len(kept) >= limit:
            return False
        kept.append(now)
        _hits[key] = kept
        return True


def hit_count(key: str, window_sec: float) -> int:
    """返回 key 在窗口内的命中数（不新增），用于组合判断。"""
    with _lock:
        _, kept = _prune(_hits, key, window_sec)
        return len(kept)


def fail_count(key: str, window_sec: float) -> int:
    """返回 key 在窗口内的失败次数。"""
    with _lock:
        _, kept = _prune(_fails, key, window_sec)
        return len(kept)


def record_fail(key: str) -> None:
    """记录一次失败。"""
    with _lock:
        _fails.setdefault(key, []).append(time.time())


def clear_fail(key: str) -> None:
    """清空 key 的失败记录（成功后调用，避免历史失败误锁）。"""
    with _lock:
        _fails.pop(key, None)
