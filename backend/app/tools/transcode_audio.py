"""按需扫描曲库并执行后台音频管线。

母版搬 OSS、按存储设置补 AAC 完整版、会员曲目补试听；16-bit PCM 已退役。
与后台「曲目 → 全部处理」共用 `app/audio_norm.py`，本 CLI 留给服务器直接操作。

用法（服务器上，容器内）：
    docker exec wuxing-backend python -m app.tools.transcode_audio          # 实际执行
    docker exec wuxing-backend python -m app.tools.transcode_audio --dry    # 只扫描不改动
"""
import argparse
import os
import sys

# 允许以 `python -m app.tools.transcode_audio` 直接跑（容器 WORKDIR=/app）
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app import audio_norm, storage  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models import Track  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="曲库母版迁移、可选 AAC 与会员试听处理")
    parser.add_argument("--dry", action="store_true", help="只扫描报告，不改动")
    parser.add_argument("--fix-mime", action="store_true",
                        help="只修衍生对象的 Content-Type（早期裸分片上传的是 octet-stream，"
                             "PC 微信会报 Format error），不转码")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        cfg = storage.get_storage_cfg(db)
        if args.fix_mime:
            return fix_mime(db, cfg)
        tracks = db.query(Track).filter(Track.audio_url != "").all()
        print(f"共 {len(tracks)} 条音频曲目")
        stats: dict[str, int] = {}
        for t in tracks:
            result = audio_norm.process_track(db, cfg, t, dry=args.dry)
            key = result.split(":")[0]
            stats[key] = stats.get(key, 0) + 1
            print(f"  [{t.id}] {t.title}: {result}", flush=True)
        print("汇总:", stats)
        return 0
    finally:
        db.close()


def fix_mime(db, cfg: dict) -> int:
    """把 play//aac//prev/ 衍生对象的 Content-Type 修成按扩展名的正确值。
    用 OSS 自拷贝（metadata-directive=REPLACE）改元数据，不重传内容。"""
    if cfg.get("provider") != "oss":
        print("非 OSS 存储，无需修")
        return 0
    bucket = storage._oss_bucket(cfg)
    bucket_name = cfg["oss_bucket"]
    fixed = skipped = 0
    seen: set[str] = set()
    for t in db.query(Track).all():
        for url in (t.play_url, t.aac_url, t.preview_url):
            if not url or url in seen:
                continue
            seen.add(url)
            key = storage.oss_key_from_url(cfg, url)
            if not key:
                continue
            ctype = storage.audio_content_type(key)
            try:
                cur = bucket.head_object(key).headers.get("Content-Type", "")
                if cur == ctype:
                    skipped += 1
                    continue
                bucket.copy_object(bucket_name, key, key, headers={
                    "Content-Type": ctype,
                    "x-oss-metadata-directive": "REPLACE",
                })
                print(f"  {key}: {cur} -> {ctype}", flush=True)
                fixed += 1
            except Exception as e:  # noqa: BLE001
                print(f"  {key}: 失败 {e}", flush=True)
    print(f"修复 {fixed}，本就正确 {skipped}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
