"""曲库 24-bit WAV → 16-bit PCM 的后台自动归一。

起因：PC 微信解不了 24-bit WAV（Unable to decode audio data），16-bit 是全端公分母。

两个触发口：
- 后台「曲目 → 音频兼容修复」按钮 → 全量扫描；
- 曲目保存（新建/编辑且音频是 .wav）→ 自动排队单条，24-bit 会被默默转成 16-bit。

进程内单 worker 线程：部署是单容器，线程队列够用；多实例部署时才需要换真队列。
幂等：已是 16-bit 的跳过；覆盖写回原地址（URL 不变，不动数据库）。
"""
import logging
import os
import tempfile
import threading
from datetime import datetime

import httpx

from app import storage
from app.database import SessionLocal
from app.models import Track
from app.wav_compat import convert_24_to_16, needs_pcm16_downmix, read_wav_info

logger = logging.getLogger("uvicorn.error")

CHUNK = 1024 * 1024
_HEAD_BYTES = 64 * 1024  # 判定位深只需文件头

_lock = threading.Lock()
_queue: list[int | None] = []   # None = 全量扫描（worker 展开成具体 id）
_worker: threading.Thread | None = None
_results: list[dict] = []       # 最近 100 条处理结果
_done = 0
_current = ""
_finished_at: str | None = None

_MAX_RESULTS = 100


def _oss_key_from_url(cfg: dict, url: str) -> str | None:
    """从完整 URL 反推 OSS 对象键；不是本店 OSS 的地址返回 None。"""
    bases = []
    if cfg.get("oss_base_url"):
        bases.append(cfg["oss_base_url"].rstrip("/"))
    endpoint = (cfg.get("oss_endpoint") or "").replace("https://", "").replace("http://", "").rstrip("/")
    if cfg.get("oss_bucket") and endpoint:
        bases.append(f"https://{cfg['oss_bucket']}.{endpoint}")
    for base in bases:
        if url.startswith(base + "/"):
            return url[len(base) + 1 :]
    return None


def _download(url: str, dst: str, limit: int | None = None) -> None:
    with httpx.stream("GET", url, timeout=60, follow_redirects=True) as resp:
        resp.raise_for_status()
        total = 0
        with open(dst, "wb") as f:
            for chunk in resp.iter_bytes(CHUNK):
                if limit is not None and total + len(chunk) > limit:
                    f.write(chunk[: limit - total])
                    return
                f.write(chunk)
                total += len(chunk)


def process_track(cfg: dict, track: Track, dry: bool = False) -> str:
    """处理单条曲目。返回 skip16 / skip-foreign / converted / dry-run / error:<原因>。
    头部探测只下载前 64KB；确认需要转换才拉全量。"""
    url = track.audio_url or ""
    provider = cfg.get("provider", "local")

    local_path = None
    oss_key = None
    if url.startswith("/uploads/"):
        local_path = os.path.join(storage.UPLOAD_DIR, url[len("/uploads/"):])
        if not os.path.exists(local_path):
            return f"error:本地文件不存在 {url}"
    elif url.startswith("http"):
        if provider != "oss":
            return "skip-foreign"
        oss_key = _oss_key_from_url(cfg, url)
        if not oss_key:
            return "skip-foreign"
    else:
        return "skip-foreign"

    tmpdir = tempfile.mkdtemp(prefix="wav16-")
    try:
        # 1) 头部探测
        head = os.path.join(tmpdir, "head.wav")
        if local_path:
            info = read_wav_info(local_path)
            need = bool(info and info["format"] == 1 and info["bits"] == 24)
        else:
            _download(url, head, limit=_HEAD_BYTES)
            info = read_wav_info(head)
            need = needs_pcm16_downmix(head)
        if not info:
            return "error:不是有效 WAV"
        if not need:
            return "skip16"
        if dry:
            return f"dry-run（{info['bits']}bit {info['sample_rate']}Hz {info['channels']}ch）"

        # 2) 全量转换
        src = local_path or os.path.join(tmpdir, "src.wav")
        if not local_path:
            _download(url, src)
        # 本地覆盖要用同目录临时文件：os.replace 不能跨盘/跨挂载点
        # （容器里 /tmp 与 /app/uploads 可能不在同一文件系统）
        out = (local_path + ".new16") if local_path else os.path.join(tmpdir, "out.wav")
        convert_24_to_16(src, out)

        # 3) 覆盖写回原地址：本地同目录原子替换；OSS 分片上传完成才替换对象
        if local_path:
            os.replace(out, local_path)
        else:
            try:
                import oss2

                bucket = storage._oss_bucket(cfg)
                oss2.resumable_upload(
                    bucket, oss_key, out,
                    multipart_threshold=CHUNK * 5, part_size=CHUNK * 5,
                )
            finally:
                try:
                    os.remove(out)
                except OSError:
                    pass
        return "converted"
    except Exception as e:  # noqa: BLE001
        logger.warning("音频降位深失败 track=%s：%s", track.id, e)
        return f"error:{e}"
    finally:
        if local_path:
            try:
                os.remove(local_path + ".new16")
            except OSError:
                pass
        for f in os.listdir(tmpdir):
            try:
                os.remove(os.path.join(tmpdir, f))
            except OSError:
                pass
        try:
            os.rmdir(tmpdir)
        except OSError:
            pass


# ── 后台 worker ──
def enqueue(track_id: int | None) -> None:
    """排队处理：track_id 为 None 表示全量扫描。已在队列里的不重复排。"""
    global _worker
    with _lock:
        if track_id is not None and track_id in _queue:
            return
        _queue.append(track_id)
        if _worker is None or not _worker.is_alive():
            _worker = threading.Thread(target=_run, daemon=True, name="audio-norm")
            _worker.start()


def _record(track: Track | None, result: str) -> None:
    global _done
    with _lock:
        _done += 1
        _results.append({
            "trackId": track.id if track else None,
            "title": track.title if track else "",
            "result": result,
            "at": datetime.utcnow().isoformat(),
        })
        del _results[:-_MAX_RESULTS]


def _run() -> None:
    global _current, _finished_at
    while True:
        with _lock:
            if not _queue:
                _current = ""
                _finished_at = datetime.utcnow().isoformat()
                return
            item = _queue.pop(0)
        db = SessionLocal()
        try:
            cfg = storage.get_storage_cfg(db)
            if item is None:
                ids = [
                    t.id for t in db.query(Track.id).filter(Track.audio_url.like("%.wav")).all()
                ]
                with _lock:
                    # 展开到队首，保持「先全量后单条」的触发顺序
                    fresh = [i for i in ids if i not in _queue]
                    _queue[:0] = fresh
                continue
            track = db.query(Track).filter(Track.id == item).first()
            if not track or not (track.audio_url or "").lower().endswith(".wav"):
                continue
            with _lock:
                _current = track.title
            _record(track, process_track(cfg, track))
        except Exception as e:  # noqa: BLE001
            logger.warning("音频归一 worker 异常（track=%s）：%s", item, e)
        finally:
            db.close()


def status() -> dict:
    with _lock:
        running = _worker is not None and _worker.is_alive()
        return {
            "running": running,
            "pending": len(_queue),
            "done": _done,
            "current": _current,
            "finishedAt": _finished_at,
            "results": list(reversed(_results[-50:])),
        }
