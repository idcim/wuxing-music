from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import audio_norm
from app.database import get_db
from app.models import Admin, Track
from app.schemas import TrackIn, ok
from app.security import require_perm

router = APIRouter(prefix="/api/admin/tracks", tags=["tracks"])


def _enqueue_audio_pipeline(track: Track) -> None:
    """有音频地址就排队走一遍归一管线（后台线程，不阻塞保存）：
    母版搬 OSS、24-bit WAV 补 16-bit 副本、有 ffmpeg 则补 AAC 副本。
    详见 app/audio_norm.py。"""
    if track.audio_url:
        audio_norm.enqueue(track.id)


def _to_dict(t: Track) -> dict:
    return {
        "id": t.id,
        "element_id": t.element_id,
        "title": t.title,
        "duration": t.duration,
        "duration_sec": t.duration_sec,
        "hz": t.hz,
        "tag": t.tag,
        "plays": t.plays,
        "audio_url": t.audio_url,
        "play_url": t.play_url,
        "aac_url": t.aac_url,
        "cover_url": t.cover_url,
        "is_premium": t.is_premium,
        "preview_sec": t.preview_sec,
        "is_online": t.is_online,
        "sort": t.sort,
    }


@router.get("")
def list_tracks(
    element_id: str | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("tracks:view")),
):
    q = db.query(Track)
    if element_id:
        q = q.filter(Track.element_id == element_id)
    total = q.count()
    rows = (
        q.order_by(Track.element_id, Track.sort)
        .offset((page - 1) * size)
        .limit(size)
        .all()
    )
    return ok({"total": total, "items": [_to_dict(t) for t in rows]})


@router.post("")
def create_track(
    body: TrackIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("tracks:edit")),
):
    track = Track(**body.model_dump())
    db.add(track)
    db.commit()
    db.refresh(track)
    _enqueue_audio_pipeline(track)
    return ok(_to_dict(track))


@router.put("/{track_id}")
def update_track(
    track_id: int,
    body: TrackIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("tracks:edit")),
):
    track = db.query(Track).filter(Track.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="曲目不存在")
    for k, v in body.model_dump().items():
        setattr(track, k, v)
    db.commit()
    db.refresh(track)
    _enqueue_audio_pipeline(track)
    return ok(_to_dict(track))


@router.delete("/{track_id}")
def delete_track(
    track_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("tracks:edit")),
):
    track = db.query(Track).filter(Track.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="曲目不存在")
    db.delete(track)
    db.commit()
    return ok()


# ── 音频兼容归一（24bit WAV → 16bit，修 PC 微信无法解码）──
# 不存在 GET/POST /{track_id} 路由，/normalize-audio 不会被抢占，声明顺序无关。

@router.post("/normalize-audio")
def normalize_audio(_: Admin = Depends(require_perm("tracks:edit"))):
    """全量扫描曲库音频，后台线程逐条处理。返回 job 编号供前端过滤本轮结果。"""
    job = audio_norm.enqueue(None)
    return ok({**audio_norm.status(), "job": job})


@router.post("/{track_id}/normalize")
def normalize_track(
    track_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("tracks:edit")),
):
    """单曲目处理（后台线程）：母版上 OSS、16-bit/AAC/试听剪辑缺啥补啥。"""
    track = db.query(Track).filter(Track.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="曲目不存在")
    audio_norm.enqueue(track.id)
    return ok(audio_norm.status())


@router.get("/normalize-audio")
def normalize_audio_status(_: Admin = Depends(require_perm("tracks:view"))):
    return ok(audio_norm.status())
