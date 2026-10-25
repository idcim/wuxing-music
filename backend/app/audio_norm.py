"""曲库原文件上传与持久历史。

当前暂停自动转码：后台只将本地原文件上传 OSS，已上传文件直接跳过。
不生成 16-bit、AAC 或试听副本；旧转换工具函数保留但不由任务入口调用。
保存曲目和全量扫描沿用持久任务、重试、版本校验与历史，原文件内容不改写。
"""
import logging
import os
import shutil
import tempfile
import threading
import time
from datetime import datetime

import httpx

from app import audio_history, storage
from app.database import SessionLocal
from app.models import AudioProcessBatch, Track

logger = logging.getLogger("uvicorn.error")

CHUNK = 1024 * 1024

_lock = threading.Lock()
_queue: list[tuple[int, int, int]] = []  # 曲目 id、批次 id、音源代次
_worker: threading.Thread | None = None
_active_task: tuple[int, int, int] | None = None
_results: list[dict] = []       # 最近 100 条处理结果
_done = 0
_seq = 0                        # 结果记录的单调序号，前端据此识别「这次点击之后的新结果」
_current = ""
_current_id = 0                 # 正在处理的曲目 id（0 = 空闲），前端行级「处理中」状态用
_finished_at: str | None = None
_current_job = 0

_MAX_RESULTS = 100
_MAX_ATTEMPTS = 3


def _oss_key_from_url(cfg: dict, url: str) -> str | None:
    """从完整 URL 反推 OSS 对象键；不是本店 OSS 的地址返回 None。"""
    return storage.oss_key_from_url(cfg, url)


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


AAC_BITRATE = "192k"


def _encode_aac(src_path: str, dst_path: str, bitrate: str = AAC_BITRATE, clip_sec: int = 0) -> None:
    import subprocess

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("no-ffmpeg")
    cmd = [ffmpeg, "-nostdin", "-y", "-i", src_path]
    if clip_sec > 0:
        cmd += ["-t", str(clip_sec)]
    cmd += [
        # -f mp4：目标可能是 .part 临时名，ffmpeg 按扩展名猜封装格式会猜错
        "-map", "0:a:0", "-vn", "-sn", "-dn", "-threads", "2",
        "-f", "mp4", "-c:a", "aac", "-b:a", bitrate, "-movflags", "+faststart", dst_path,
    ]
    r = subprocess.run(cmd, capture_output=True, timeout=1800)
    if r.returncode != 0 or not os.path.exists(dst_path) or os.path.getsize(dst_path) == 0:
        tail = r.stderr.decode("utf-8", "ignore")[-200:] if r.stderr else ""
        raise RuntimeError(f"ffmpeg 转码失败：{tail}")


def _download_oss(cfg: dict, key: str, dst: str) -> None:
    """用鉴权的 OSS 源站接口取母版，避免 CDN 防盗链/过期地址导致整批回源失败。"""
    import oss2

    for attempt in range(3):
        try:
            oss2.resumable_download(
                storage._oss_bucket(cfg), key, dst,
                store=oss2.ResumableDownloadStore(root=os.path.dirname(dst)),
                multiget_threshold=20 * CHUNK, part_size=10 * CHUNK, num_threads=2,
            )
            return
        except Exception as e:
            if attempt == 2:
                raise RuntimeError(f"OSS 母版下载失败：{e}") from e
            time.sleep(2 ** attempt)


def _upload_oss(cfg: dict, key: str, path: str) -> None:
    import oss2

    # 分片上传必须显式给 Content-Type——裸 upload_part 出来的是 application/octet-stream，
    # PC 微信的媒体元素对错误的 Content-Type 会报 Format error（实测 10004）。
    # 用硬编码表而不是 mimetypes：slim 容器没有系统 mime 库，.m4a 会猜空
    ctype = storage.audio_content_type(key)
    bucket = storage._oss_bucket(cfg)
    oss2.resumable_upload(
        bucket, key, path,
        multipart_threshold=CHUNK * 5, part_size=CHUNK * 5,
        headers={"Content-Type": ctype},
    )


def _probe_audio(src_path: str) -> None:
    """转码前确认源文件含可解码音频流。不是音频时给出可读原因，
    而不是把 ffmpeg 的「received no packets」原文甩给管理员。"""
    size = os.path.getsize(src_path)
    if size < 1024:
        raise RuntimeError(f"源文件只有 {size} 字节，不是有效音频（可能上传中断或传错文件）")
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return  # 没有 ffprobe 时不挡路，交给 ffmpeg 自己判断
    import subprocess
    r = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "stream=codec_type",
         "-of", "csv=p=0", src_path],
        capture_output=True, timeout=60,
    )
    if b"audio" not in r.stdout:
        raise RuntimeError("源文件里没有音频流（可能传错文件类型）")


def process_track(db, cfg: dict, track: Track, dry: bool = False) -> str:
    """只将本地原文件搬到 OSS；不下载、不探测、不生成任何播放副本。"""
    url = track.audio_url or ""
    if not url:
        return "skip:无音频地址"
    if cfg.get("provider", "local") != "oss" or not url.startswith("/uploads/"):
        return "skip:原文件已保存，自动转码已停用"
    key = url[len("/uploads/"):]
    root = os.path.realpath(storage.UPLOAD_DIR)
    source = os.path.realpath(os.path.join(root, key))
    try:
        if os.path.commonpath([root, source]) != root:
            return "error:原文件路径超出上传目录"
    except ValueError:
        return "error:原文件路径无效"
    if not os.path.isfile(source):
        return "error:本地原文件不存在"
    if dry:
        return "dry:master"
    ident, revision = track.id, track.audio_revision or 0
    db.rollback()
    try:
        _upload_oss(cfg, key, source)
        changed = db.query(Track).filter(Track.id == ident, Track.audio_revision == revision).update(
            {"audio_url": storage._oss_public_url(cfg, key)}, synchronize_session=False)
        db.commit()
        return "done:master" if changed else "skip:曲目已更新，交由新任务处理"
    except Exception as exc:
        db.rollback()
        return f"error:{exc}"


# ── 后台 worker ──
def mark_pending(track: Track) -> None:
    """调用方与曲目保存同事务提交，避免保存成功而任务丢失。"""
    track.audio_revision = (track.audio_revision or 0) + 1
    track.audio_pending = bool(track.audio_url)
    track.audio_attempts = 0
    track.audio_error = ""
    track.audio_job = 0


def recover_pending() -> None:
    with SessionLocal() as db:
        ids = [row.id for row in db.query(Track.id).filter(Track.audio_pending == True).all()]  # noqa: E712
    for track_id in ids:
        enqueue(track_id, persist=False)


def enqueue(track_id: int | None, persist: bool = True) -> int:
    """排队处理：track_id 为 None 表示全量扫描（每次全量开启一个新 job 编号）。
    已在队列里的不重复排。返回当前 job 编号。"""
    global _worker, _current_job
    with _lock:
        with SessionLocal() as db:
            q = db.query(Track).filter(Track.audio_url != "")
            if track_id is not None:
                q = q.filter(Track.id == track_id)
            rows = q.all()
            job = None
            if track_id is None:
                job = AudioProcessBatch(total=len(rows))
                db.add(job)
                db.flush()
                _current_job = job.id
            for track in rows:
                if persist and not track.audio_pending:
                    mark_pending(track)
                if job:
                    track.audio_job = job.id
            tasks = [(t.id, t.audio_job or 0, t.audio_revision or 0) for t in rows]
            db.commit()
        for item in tasks:
            if item not in _queue and (not persist or item != _active_task):
                _queue.append(item)
        # ⚠️ 判断条件只能是 _worker is None：worker 在锁内退出时才把自己置 None。
        # 用 is_alive() 判断会有一个「线程已判定队列空、正要退出」的窗口，
        # 这时入队的任务会被 stranded（实测后台全量扫描 0 条就是它）。
        if _worker is None:
            _worker = threading.Thread(target=_run, daemon=True, name="audio-norm")
            _worker.start()
    return _current_job


def _record(db, track_id: int, title: str, result: str, job: int, attempt: int) -> None:
    global _done, _seq
    event = audio_history.append(db, track_id, title, result, job, attempt)
    value = audio_history.serialize(event)
    # 与 pending/error 更新同事务落库：完成标记与通知不会出现一边成功一边丢失。
    db.commit()
    with _lock:
        _done += 1
        _seq = value["seq"]
        _results.append(value)
        del _results[:-_MAX_RESULTS]
    logger.info("音频处理：track=%s「%s」→ %s", track_id, title, result)


def _run() -> None:
    global _current, _current_id, _finished_at, _worker, _active_task
    while True:
        with _lock:
            if not _queue:
                _current = ""
                _current_id = 0
                _finished_at = datetime.utcnow().isoformat()
                # 锁内置 None 再退出：enqueue 只在 _worker 为 None 时起新线程，
                # 退出窗口期的入队不会被丢下
                _worker = None
                return
            _active_task = _queue.pop(0)
            item, scheduled_job, scheduled_revision = _active_task
        db = SessionLocal()
        revision = None
        attempts = 0
        job = scheduled_job
        title = ""
        try:
            cfg = storage.get_storage_cfg(db)
            track = db.query(Track).filter(Track.id == item).first()
            if not track or not track.audio_url:
                _record(db, item, "", "skip:曲目已删除或音源已移除", job, 0)
                continue
            if (track.audio_revision or 0) != scheduled_revision or (track.audio_job or 0) != scheduled_job:
                _record(db, item, track.title, "skip:曲目已更新，交由新任务处理", job, 0)
                continue
            revision = track.audio_revision or 0
            job, title = track.audio_job or 0, track.title
            attempts = (track.audio_attempts or 0) + 1
            db.query(Track).filter(Track.id == item, Track.audio_revision == revision).update(
                {"audio_attempts": attempts}, synchronize_session=False,
            )
            db.commit()
            with _lock:
                _current = track.title
                _current_id = track.id
            result = process_track(db, cfg, track)
            error = result.removeprefix("error:") if result.startswith("error:") else ""
            retry = bool(error) and attempts < _MAX_ATTEMPTS
            updated = db.query(Track).filter(
                Track.id == item, Track.audio_revision == revision, Track.audio_job == job,
            ).update({
                "audio_pending": retry,
                "audio_error": error,
            }, synchronize_session=False)
            if not updated:
                result, retry = "skip:曲目已更新，交由新任务处理", False
            _record(db, item, title, f"retry:第 {attempts} 次失败，将自动重试：{error}" if retry else result, job, attempts)
            if retry and updated:
                time.sleep(2 ** attempts)
                enqueue(item, persist=False)
        except Exception as e:  # noqa: BLE001
            logger.warning("音频归一 worker 异常（track=%s）：%s", item, e)
            db.rollback()
            # 数据库/存储配置等管线外异常也要有可见结果，不能静默丢在内存队列外。
            try:
                track = db.query(Track).filter(Track.id == item).first()
                if track and (revision is None or (track.audio_revision == revision and track.audio_job == job)):
                    attempts = attempts or (track.audio_attempts or 0) + 1
                    retry = attempts < _MAX_ATTEMPTS
                    track.audio_attempts = attempts
                    track.audio_pending = retry
                    track.audio_error = str(e)
                    _record(db, item, track.title, f"retry:{e}" if retry else f"error:{e}", track.audio_job or 0, attempts)
                    if retry:
                        time.sleep(2 ** attempts)
                        enqueue(item, persist=False)
            except Exception:
                db.rollback()
                # 数据库暂时不可用时保留持久化 pending，重启恢复时再次执行。
                logger.exception("音频任务状态写回失败（track=%s）", item)
        finally:
            with _lock:
                _current_id = 0
                _active_task = None
            db.close()


def status() -> dict:
    with _lock:
        state = {
            # _worker 在锁内置 None 后才算退出，单看 is_alive 有退出窗口
            "running": _worker is not None,
            "pending": len(_queue),
            "queuedIds": [item[0] for item in _queue],
            "currentId": _current_id,
            "done": _done,
            "current": _current,
            "job": _current_job,
            "finishedAt": _finished_at,
        }
    with SessionLocal() as db:
        state["results"] = audio_history.history(db, size=50)["items"]
        state["batch"] = audio_history.batch_summary(db)
        state["job"] = state["batch"]["job"] if state["batch"] else 0
    return state
