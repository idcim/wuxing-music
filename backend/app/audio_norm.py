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
from app.wav_compat import Wav24To16Streamer, needs_pcm16_downmix, read_wav_info

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


def _download(url: str, dst: str, limit: int | None = None, retries: int = 4) -> None:
    """下载到本地，支持断点续传。服务器出网间歇抖动，几百 MB 的 WAV
    一次下完是奢望——中断后按已落盘字节发 Range 续传；对方不支持 Range
    （回 200 而非 206）则从头重来。"""
    import time

    have = 0
    for attempt in range(retries):
        try:
            headers = {"Range": f"bytes={have}-"} if have else {}
            with httpx.stream(
                "GET", url, timeout=httpx.Timeout(60, read=300),
                follow_redirects=True, headers=headers,
            ) as resp:
                resp.raise_for_status()
                mode = "ab"
                if have and resp.status_code == 200:
                    # 对方不认 Range，续传会拼出重复数据，只能清零重来
                    have = 0
                    mode = "wb"
                with open(dst, mode) as f:
                    # 256KB 粒度：断流时已落盘的进度才能记上账，下次 Range 从这里续。
                    # 用 1MB 粒度的话，断在第一块内 = 进度归零，续传无从谈起。
                    for chunk in resp.iter_bytes(256 * 1024):
                        if limit is not None and have + len(chunk) >= limit:
                            f.write(chunk[: limit - have])
                            return
                        f.write(chunk)
                        have += len(chunk)
            return  # 完整下完
        except (httpx.HTTPError, OSError) as e:
            logger.warning("下载中断（已落盘 %s 字节）：%s；第 %s 次重试", have, e, attempt + 1)
            if attempt == retries - 1:
                raise RuntimeError(f"下载失败（重试 {retries} 次后放弃）：{e}") from e
            time.sleep(2 * (attempt + 1))


def _stream_with_resume(url: str, retries: int = 4):
    """流式下载（生成器）。中断后按已产出字节发 Range 续传；
    流式转换状态下无法从头重来，对方不认 Range 时直接报错。"""
    import time

    produced = 0
    for attempt in range(retries):
        try:
            headers = {"Range": f"bytes={produced}-"} if produced else {}
            with httpx.stream(
                "GET", url, timeout=httpx.Timeout(60, read=300),
                follow_redirects=True, headers=headers,
            ) as resp:
                resp.raise_for_status()
                if produced and resp.status_code == 200:
                    raise RuntimeError("对端不支持 Range，流式转换中途无法重下")
                for chunk in resp.iter_bytes(256 * 1024):
                    produced += len(chunk)
                    yield chunk
            return
        except (httpx.HTTPError, OSError) as e:
            logger.warning("流式下载中断（已产出 %s 字节）：%s；第 %s 次重试", produced, e, attempt + 1)
            if attempt == retries - 1:
                raise RuntimeError(f"下载失败（重试 {retries} 次后放弃）：{e}") from e
            time.sleep(2 * (attempt + 1))


def _convert_local_stream(local_path: str) -> None:
    """本地文件流式转换：磁盘上只有「原文件 + 产物」两份，产物落在同目录
    （os.replace 不能跨挂载点），完成后原子替换。"""
    out = local_path + ".new16"
    conv = Wav24To16Streamer()
    try:
        with open(local_path, "rb") as fin, open(out, "wb") as fout:
            while True:
                chunk = fin.read(CHUNK)
                if not chunk:
                    break
                fout.write(conv.feed(chunk))
            fout.write(conv.finish())
        os.replace(out, local_path)
    finally:
        try:
            os.remove(out)
        except OSError:
            pass


def _convert_oss_stream(cfg: dict, oss_key: str, url: str) -> None:
    """OSS 对象流式转换：下载 → 转换 → 分片上传全程不落盘（磁盘零占用）。
    分片缓存在内存里凑够 5MB 才传一片；上传完成前原对象不受影响，
    任一步失败会 abort 掉这次分片上传，原对象原样保留。"""
    import time

    import oss2

    bucket = storage._oss_bucket(cfg)
    conv = Wav24To16Streamer()
    part_buf = bytearray()
    parts: list = []
    part_no = 1
    upload_id = None
    PART = 5 * 1024 * 1024  # OSS 要求除末片外每片 ≥100KB，取 5MB

    def upload_piece(piece: bytes) -> None:
        nonlocal part_no
        for attempt in range(3):
            try:
                r = bucket.upload_part(oss_key, upload_id, part_no, piece)
                parts.append(oss2.models.PartInfo(part_no, r.etag))
                part_no += 1
                return
            except Exception as e:  # noqa: BLE001
                logger.warning("分片 %s 上传失败：%s；第 %s 次重试", part_no, e, attempt + 1)
                if attempt == 2:
                    raise
                time.sleep(2 * (attempt + 1))

    try:
        upload_id = bucket.init_multipart_upload(oss_key).upload_id
        for chunk in _stream_with_resume(url):
            part_buf += conv.feed(chunk)
            while len(part_buf) >= PART:
                piece = bytes(part_buf[:PART])
                del part_buf[:PART]
                upload_piece(piece)
        part_buf += conv.finish()
        if part_buf:
            upload_piece(bytes(part_buf))
        bucket.complete_multipart_upload(oss_key, upload_id, parts)
    except Exception:
        if upload_id:
            try:
                bucket.abort_multipart_upload(oss_key, upload_id)
            except Exception:  # noqa: BLE001
                pass
        raise


def process_track(cfg: dict, track: Track, dry: bool = False) -> str:
    """处理单条曲目。返回 skip16 / skip-foreign / converted / dry-run / error:<原因>。
    头部探测只下载前 64KB；确认需要转换才转换，全程流式、逐条处理完即清理。"""
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
        # 头部探测（只拉前 64KB）
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

        if local_path:
            _convert_local_stream(local_path)
        else:
            _convert_oss_stream(cfg, oss_key, url)
        return "converted"
    except Exception as e:  # noqa: BLE001
        logger.warning("音频降位深失败 track=%s：%s", track.id, e)
        return f"error:{e}"
    finally:
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
