"""一次性/按需工具：把曲库里的 24-bit WAV 降位深为 16-bit PCM。

起因：PC 微信解不了 24-bit WAV（Unable to decode audio data），手机端能解。
16-bit PCM 是所有端的公分母。

日常已不需要手动跑：后台「曲目 → 音频兼容修复」按钮 + 曲目保存时的自动检查
走同一套 `app/audio_norm.py`。本 CLI 留给服务器上直接操作的场景。

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
            result = audio_norm.process_track(cfg, t, dry=args.dry)
            key = result.split(":")[0]
            stats[key] = stats.get(key, 0) + 1
            print(f"  [{t.id}] {t.title}: {result}", flush=True)
        print("汇总:", stats)
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
