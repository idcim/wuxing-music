"""一次性/按需工具：把曲库里的 24-bit WAV 降位深为 16-bit PCM。

起因：PC 微信解不了 24-bit WAV（Unable to decode audio data），手机端能解。
16-bit PCM 是所有端的公分母。

用法（服务器上，容器内）：
    docker exec wuxing-backend python -m app.tools.transcode_audio          # 实际执行
    docker exec wuxing-backend python -m app.tools.transcode_audio --dry    # 只扫描不改动

幂等：已是 16-bit 的跳过；覆盖写回**原地址**（URL 不变，无需改数据库）。
非本店 OSS / 本地 uploads 的外链 WAV 只报告，不动。
"""
import argparse
import os
import sys
import tempfile

import httpx

# 允许以 `python -m app.tools.transcode_audio` 直接跑（容器 WORKDIR=/app）
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app import storage  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models import Track  # noqa: E402
from app.wav_compat import convert_24_to_16, needs_pcm16_downmix, read_wav_info  # noqa: E402

CHUNK = 1024 * 1024


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


def _download(url: str, dst: str) -> None:
    with httpx.stream("GET", url, timeout=60, follow_redirects=True) as resp:
        resp.raise_for_status()
        with open(dst, "wb") as f:
            for chunk in resp.iter_bytes(CHUNK):
                f.write(chunk)


def _process_track(db, cfg, track: Track, dry: bool) -> str:
    """返回处理结果：skip16 / skip-foreign / converted / dry-run / error:<原因>"""
    url = track.audio_url
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
    src = local_path or os.path.join(tmpdir, "src.wav")
    try:
        if not local_path:
            _download(url, src)
        info = read_wav_info(src)
        if not info:
            return "error:不是有效 WAV"
        if not needs_pcm16_downmix(src):
            return "skip16"
        if dry:
            return f"dry-run（{info['bits']}bit {info['sample_rate']}Hz {info['channels']}ch）"

        out = os.path.join(tmpdir, "out.wav")
        convert_24_to_16(src, out)

        if local_path:
            os.replace(out, local_path)
        else:
            import oss2

            bucket = storage._oss_bucket(cfg)
            oss2.resumable_upload(
                bucket, oss_key, out,
                multipart_threshold=CHUNK * 5, part_size=CHUNK * 5,
            )
        return "converted"
    except Exception as e:  # noqa: BLE001
        return f"error:{e}"
    finally:
        if not local_path:
            try:
                os.remove(src)
            except OSError:
                pass
        try:
            os.remove(os.path.join(tmpdir, "out.wav"))
            os.rmdir(tmpdir)
        except OSError:
            pass


def main() -> int:
    parser = argparse.ArgumentParser(description="曲库 24bit WAV → 16bit PCM 降位深")
    parser.add_argument("--dry", action="store_true", help="只扫描报告，不改动")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        cfg = storage.get_storage_cfg(db)
        tracks = db.query(Track).filter(Track.audio_url.like("%.wav")).all()
        print(f"共 {len(tracks)} 条 WAV 曲目")
        stats: dict[str, int] = {}
        for t in tracks:
            result = _process_track(db, cfg, t, args.dry)
            stats[result.split(":")[0]] = stats.get(result.split(":")[0], 0) + 1
            print(f"  [{t.id}] {t.title}: {result}")
        print("汇总:", stats)
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
