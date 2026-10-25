"""运营查询分页，不截断旧任务、操作历史或媒体资产。"""
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.security import require_perm
from .common import ok, serialize
from .models import Event, Job, MediaAsset

router = APIRouter()
JobState = Literal["", "pending", "running", "failed", "done"]
JobKind = Literal["", "media", "payment", "close", "refund", "shipping", "receipt", "course_delivery"]
MediaState = Literal["", "uploading", "processing", "ready", "failed"]


def paginated(query, page, size, dump=serialize):
    total = query.count()
    rows = query.order_by(query.column_descriptions[0]["entity"].id.desc()).offset((page - 1) * size).limit(size).all()
    return ok(dict(items=[dump(row) for row in rows], total=total))


@router.get("/media")
def media_list(page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100),
               state: MediaState = "", q: str = Query("", max_length=255),
               _=Depends(require_perm("commerce:view")), db: Session = Depends(get_db)):
    query = db.query(MediaAsset)
    if state:
        query = query.filter_by(state=state)
    if q.strip():
        query = query.filter(MediaAsset.name.contains(q.strip(), autoescape=True))
    return paginated(query, page, size, lambda row: serialize(row, ("source_key", "playback_key")))


@router.get("/jobs")
def jobs(page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100),
         state: JobState = "", kind: JobKind = "", q: str = Query("", max_length=128),
         _=Depends(require_perm("commerce:view")), db: Session = Depends(get_db)):
    query = db.query(Job)
    if state:
        query = query.filter_by(state=state)
    if kind:
        query = query.filter_by(kind=kind)
    text = q.strip()
    if text:
        matches = [Job.key.contains(text, autoescape=True)]
        if text.isascii() and text.isdigit() and len(text) <= 18:
            matches.append(Job.id == int(text))
        query = query.filter(or_(*matches))
    return paginated(query, page, size)


@router.get("/events")
def events(page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100),
           q: str = Query("", max_length=80), subject: str = Query("", max_length=80),
           action: str = Query("", max_length=80), _=Depends(require_perm("commerce:view")),
           db: Session = Depends(get_db)):
    query = db.query(Event)
    if subject.strip():
        query = query.filter_by(subject=subject.strip())
    if action.strip():
        query = query.filter_by(action=action.strip())
    if q.strip():
        query = query.filter(or_(Event.subject.contains(q.strip(), autoescape=True),
                                 Event.operator.contains(q.strip(), autoescape=True)))
    return paginated(query, page, size)
