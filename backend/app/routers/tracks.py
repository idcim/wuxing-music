from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Admin, Track
from app.schemas import TrackIn, ok
from app.security import require_perm

router = APIRouter(prefix="/api/admin/tracks", tags=["tracks"])


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
