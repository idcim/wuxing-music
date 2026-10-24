"""曲库音频管线的后台自动归一（多版本播放副本）。

起因：PC 微信解不了 24-bit WAV（Unable to decode audio data），16-bit PCM 是全端公分母；
AAC 副本给手机/H5 省一个数量级的流量。

每条曲目的流水线（幂等，缺啥补啥）：
1. 母版暂存在服务端本地且存储是 OSS → 母版推 OSS、改写 audio_url、删本地暂存；
2. WAV 是 24-bit 且无 play_url → 生成 16-bit PCM 播放副本（play/ 前缀）；
3. 有 ffmpeg 且无 aac_url → 生成 AAC 192k 副本（aac/ 前缀，.m4a）。

两个触发口：
- 后台「曲目 → 音频兼容修复」按钮 → 全量扫描；
- 曲目保存（新建/编辑且有音频地址）→ 自动排队单条；音频上传接口先落服务端暂存，
  保存曲目时管线就把母版+副本一起推 OSS——上传者不必在场等。

进程内单 worker 线程：部署是单容器，线程队列够用；多实例部署时才需要换真队列。
母版内容永不被修改（本地暂存的「修改」只是搬到 OSS，字节不动）。
"""
import logging
import os
import shutil
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
_seq = 0                        # 结果记录的单调序号，前端据此识别「这次点击之后的新结果」
_current = ""
_current_id = 0                 # 正在处理的曲目 id（0 = 空闲），前端行级「处理中」状态用
_finished_at: str | None = None
_job_seq = 0                    # 全量扫描的任务编号（每次点击 +1）
_current_job = 0

_MAX_RESULTS = 100


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


def _convert_local_stream(local_path: str, out_path: str) -> None:
    """本地文件流式转换：先写到同目录临时文件（os.replace 不能跨挂载点），
    完成后原子改名到衍生路径；母版原样保留。"""
    tmp = out_path + ".part"
    conv = Wav24To16Streamer()
    try:
        with open(local_path, "rb") as fin, open(tmp, "wb") as fout:
            while True:
                chunk = fin.read(CHUNK)
                if not chunk:
                    break
                fout.write(conv.feed(chunk))
            fout.write(conv.finish())
        os.replace(tmp, out_path)
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


def _convert_oss_stream(cfg: dict, oss_key: str, url: str) -> None:
    """OSS 流式转换：下载母版 → 转换 → 分片上传到衍生键（play/ 前缀），
    全程不落盘（磁盘零占用）。分片缓存在内存里凑够 5MB 才传一片；
    上传完成前衍生对象不可见，任一步失败会 abort 掉这次分片上传。
    母版对象全程不受影响。"""
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
        # Content-Type 必须在 init 时给（分片上传的特性），否则对象是
        # application/octet-stream，PC 微信媒体元素会报 Format error
        upload_id = bucket.init_multipart_upload(
            oss_key, headers={"Content-Type": "audio/wav"}
        ).upload_id
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


AAC_BITRATE = "192k"


def _encode_aac(src_path: str, dst_path: str, bitrate: str = AAC_BITRATE, clip_sec: int = 0) -> None:
    """ffmpeg 转 AAC(m4a)，faststart 便于流式起播；clip_sec>0 时只取前 N 秒（试听剪辑）。
    没有 ffmpeg 抛 no-ffmpeg（调用方降级跳过）。"""
    import subprocess

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("no-ffmpeg")
    cmd = [ffmpeg, "-y", "-i", src_path]
    if clip_sec > 0:
        cmd += ["-t", str(clip_sec)]
    cmd += [
        # -f mp4：目标可能是 .part 临时名，ffmpeg 按扩展名猜封装格式会猜错
        "-f", "mp4", "-c:a", "aac", "-b:a", bitrate, "-movflags", "+faststart", dst_path,
    ]
    r = subprocess.run(cmd, capture_output=True, timeout=1800)
    if r.returncode != 0 or not os.path.exists(dst_path) or os.path.getsize(dst_path) == 0:
        tail = r.stderr.decode("utf-8", "ignore")[-200:] if r.stderr else ""
        raise RuntimeError(f"ffmpeg 转码失败：{tail}")


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
    if src_path.lower().endswith(".wav"):
        if read_wav_info(src_path):
            return
        head = open(src_path, "rb").read(16).hex()
        raise RuntimeError(f"源文件不是有效 WAV（头部 {head}），可能传错文件类型")
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
    """单条曲目的完整管线（幂等，缺啥补啥）。返回 done:明细 / skip:原因 / dry:明细 / error:原因。

    母版内容永不修改；「master」阶段只是把本地暂存的母版原样搬上 OSS。
    磁盘占用：一份母版 + 正在生成的副本，处理完即清理。
    """
    provider = cfg.get("provider", "local")
    url = track.audio_url or ""
    if not url:
        return "skip:无音频地址"

    # ── 定位母版与派生地址 ──
    key = None          # 对象键（OSS 或本地相对 uploads 的路径，两者同构）
    local_master = None  # 母版暂存在服务端本地的绝对路径
    if url.startswith("/uploads/"):
        key = url[len("/uploads/"):]
        p = os.path.join(storage.UPLOAD_DIR, key)
        if not os.path.exists(p):
            return f"error:本地文件不存在 {url}"
        local_master = p
    elif url.startswith("http"):
        if provider != "oss":
            return "skip:外链非本店 OSS"
        key = _oss_key_from_url(cfg, url)
        if not key:
            return "skip:外链非本店 OSS"
    else:
        return "skip:地址形态未知"

    is_wav = url.lower().endswith(".wav")
    key_noext = os.path.splitext(key)[0]
    wav16_key = f"play/{key}"
    aac_key = f"aac/{key_noext}.m4a"
    preview_key = f"prev/{key_noext}.m4a"

    def _dest_url(k: str) -> str:
        return (f"/uploads/{k}" if provider != "oss" else storage._oss_public_url(cfg, k))

    def _dest_path(k: str) -> str:
        return os.path.join(storage.UPLOAD_DIR, k)

    # ── 决定要做哪些阶段 ──
    stages: list[str] = []
    if local_master and provider == "oss":
        stages.append("master")
    need_wav16 = False
    if is_wav and not track.play_url:
        # 头部探测：本地直读；OSS 只拉前 64KB
        if local_master:
            info = read_wav_info(local_master)
        else:
            tmp_head = tempfile.mkdtemp(prefix="wav16-head-")
            try:
                head = os.path.join(tmp_head, "h.wav")
                _download(url, head, limit=_HEAD_BYTES)
                info = read_wav_info(head)
            finally:
                try:
                    os.remove(head)
                    os.rmdir(tmp_head)
                except OSError:
                    pass
        if not info:
            return "error:不是有效 WAV"
        need_wav16 = bool(info["format"] == 1 and info["bits"] == 24)
        if need_wav16:
            stages.append("wav16")
    ffmpeg_ok = bool(shutil.which("ffmpeg"))
    if not track.aac_url and ffmpeg_ok:
        stages.append("aac")
    # 会员曲目的试听剪辑：非会员只能拿到这一段（版权保护，见 app/streaming.py）
    if track.is_premium and ffmpeg_ok and not track.preview_url and (track.preview_sec or 30) > 0:
        stages.append("preview")

    if not stages:
        return "skip:已就绪"
    if dry:
        return "dry:" + "+".join(stages)

    tmpdir = tempfile.mkdtemp(prefix="wavpipe-")
    done: list[str] = []
    failed: list[str] = []
    try:
        # ── 准备源文件：本地暂存直接用；OSS 母版下载到临时目录（带续传）──
        src = local_master
        if not src:
            src = os.path.join(tmpdir, "src" + os.path.splitext(key)[1])
            _download(url, src)

        # 先确认源文件是音频，坏文件直接给可读结论，不必逐阶段炸 ffmpeg
        try:
            _probe_audio(src)
        except RuntimeError as e:
            return f"error:{e}"

        # 各阶段互相隔离：一个失败不影响其它的落库（实测 AAC 失败曾把
        # 已完成的 16-bit 副本标记回滚掉）

        # ── wav16 副本 ──
        if "wav16" in stages:
            try:
                if provider == "oss":
                    out16 = os.path.join(tmpdir, "w16.wav")
                    _convert_local_stream(src, out16)
                    _upload_oss(cfg, wav16_key, out16)
                else:
                    # 本地存储直接写目标目录（_convert_local_stream 内部同目录临时文件 +
                    # 原子改名，os.replace 跨挂载点会失败，不能先写 /tmp 再搬）
                    dest = _dest_path(wav16_key)
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    _convert_local_stream(src, dest)
                track.play_url = _dest_url(wav16_key)
                done.append("wav16")
            except Exception as e:  # noqa: BLE001
                failed.append(f"wav16: {e}")

        # ── AAC 副本 ──
        if "aac" in stages:
            try:
                if provider == "oss":
                    aac_tmp = os.path.join(tmpdir, "a.m4a")
                    _encode_aac(src, aac_tmp)
                    _upload_oss(cfg, aac_key, aac_tmp)
                else:
                    dest = _dest_path(aac_key)
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    # 同理：编码到同目录临时文件再原子改名，避免半截产物被当成品
                    _encode_aac(src, dest + ".part")
                    os.replace(dest + ".part", dest)
                track.aac_url = _dest_url(aac_key)
                done.append("aac")
            except Exception as e:  # noqa: BLE001
                failed.append(f"aac: {e}")

        # ── 试听剪辑（会员曲目，preview_sec 秒的 AAC）──
        if "preview" in stages:
            try:
                if provider == "oss":
                    prev_tmp = os.path.join(tmpdir, "p.m4a")
                    _encode_aac(src, prev_tmp, bitrate="128k", clip_sec=track.preview_sec or 30)
                    _upload_oss(cfg, preview_key, prev_tmp)
                else:
                    dest = _dest_path(preview_key)
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    _encode_aac(src, dest + ".part", bitrate="128k", clip_sec=track.preview_sec or 30)
                    os.replace(dest + ".part", dest)
                track.preview_url = _dest_url(preview_key)
                done.append("preview")
            except Exception as e:  # noqa: BLE001
                failed.append(f"preview: {e}")

        # ── 母版上 OSS（本地暂存 → OSS，字节原样），最后删本地暂存 ──
        if "master" in stages:
            try:
                _upload_oss(cfg, key, local_master)
                track.audio_url = storage._oss_public_url(cfg, key)
                try:
                    os.remove(local_master)
                except OSError:
                    pass
                done.append("master")
            except Exception as e:  # noqa: BLE001
                failed.append(f"master: {e}")

        if done:
            db.commit()
        else:
            db.rollback()
        if failed:
            tail = f"（已完成 {'+'.join(done)}）" if done else ""
            logger.warning("音频管线部分失败 track=%s：%s", track.id, "; ".join(failed))
            return f"error:{'；'.join(failed)}{tail}"
        return "done:" + "+".join(done)
    except Exception as e:  # noqa: BLE001
        db.rollback()
        logger.warning("音频管线失败 track=%s：%s", track.id, e)
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
def enqueue(track_id: int | None) -> int:
    """排队处理：track_id 为 None 表示全量扫描（每次全量开启一个新 job 编号）。
    已在队列里的不重复排。返回当前 job 编号。"""
    global _worker, _job_seq, _current_job
    with _lock:
        if track_id is None:
            _job_seq += 1
            _current_job = _job_seq
            logger.info("音频归一：任务 #%s 入队（全量扫描）", _current_job)
        if track_id is not None and track_id in _queue:
            return _current_job
        _queue.append(track_id)
        # ⚠️ 判断条件只能是 _worker is None：worker 在锁内退出时才把自己置 None。
        # 用 is_alive() 判断会有一个「线程已判定队列空、正要退出」的窗口，
        # 这时入队的任务会被 stranded（实测后台全量扫描 0 条就是它）。
        if _worker is None:
            _worker = threading.Thread(target=_run, daemon=True, name="audio-norm")
            _worker.start()
    return _current_job


def _record(track: Track | None, result: str) -> None:
    global _done, _seq
    with _lock:
        _done += 1
        _seq += 1
        _results.append({
            "seq": _seq,
            "job": _current_job,
            "trackId": track.id if track else None,
            "title": track.title if track else "",
            "result": result,
            "at": datetime.utcnow().isoformat(),
        })
        del _results[:-_MAX_RESULTS]
    logger.info("音频归一：track=%s「%s」→ %s", track.id if track else "-", track.title if track else "-", result)


def _run() -> None:
    global _current, _current_id, _finished_at, _worker
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
            item = _queue.pop(0)
        db = SessionLocal()
        try:
            cfg = storage.get_storage_cfg(db)
            if item is None:
                # 全量扫描覆盖所有有音频的曲目（不只 wav：AAC/试听剪辑对 mp3 同样要补）
                ids = [
                    t.id for t in db.query(Track.id).filter(Track.audio_url != "").all()
                ]
                logger.info("音频归一：任务 #%s 展开为 %s 条曲目", _current_job, len(ids))
                with _lock:
                    # 展开到队首，保持「先全量后单条」的触发顺序
                    fresh = [i for i in ids if i not in _queue]
                    _queue[:0] = fresh
                continue
            track = db.query(Track).filter(Track.id == item).first()
            if not track or not track.audio_url:
                continue
            with _lock:
                _current = track.title
                _current_id = track.id
            _record(track, process_track(db, cfg, track))
        except Exception as e:  # noqa: BLE001
            logger.warning("音频归一 worker 异常（track=%s）：%s", item, e)
        finally:
            with _lock:
                _current_id = 0
            db.close()


def status() -> dict:
    with _lock:
        return {
            # _worker 在锁内置 None 后才算退出，单看 is_alive 有退出窗口
            "running": _worker is not None,
            "pending": len(_queue),
            "queuedIds": [i for i in _queue if i is not None],
            "currentId": _current_id,
            "done": _done,
            "current": _current,
            "job": _current_job,
            "finishedAt": _finished_at,
            "results": list(reversed(_results[-50:])),
        }
