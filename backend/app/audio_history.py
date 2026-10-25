"""音频处理历史与批次统计；不依赖 worker 的进程内结果缓存。"""
from sqlalchemy import func

from app.models import AudioProcessBatch, AudioProcessEvent


def append(db, track_id, title: str, result: str, job: int = 0, attempt: int = 0):
    outcome = result.partition(":")[0]
    event = AudioProcessEvent(
        track_id=track_id, title=title, result=result, job=job,
        attempt=attempt, outcome=outcome,
    )
    db.add(event)
    db.flush()
    return event


def serialize(event: AudioProcessEvent) -> dict:
    return {
        "seq": event.id, "job": event.job, "trackId": event.track_id,
        "title": event.title, "result": event.result, "outcome": event.outcome,
        "attempt": event.attempt, "at": event.created_at.isoformat() + "Z",
    }


def history(db, page=1, size=20, outcome=None, job=None) -> dict:
    q = db.query(AudioProcessEvent)
    if outcome:
        q = q.filter(AudioProcessEvent.outcome == outcome)
    if job is not None:
        q = q.filter(AudioProcessEvent.job == job)
    total = q.count()
    items = q.order_by(AudioProcessEvent.id.desc()).offset((page - 1) * size).limit(size).all()
    latest = db.query(func.max(AudioProcessEvent.id)).scalar() or 0
    return {"total": total, "items": [serialize(e) for e in items], "latestSeq": latest}


def batch_summary(db, job: int | None = None) -> dict | None:
    q = db.query(AudioProcessBatch)
    batch = q.filter(AudioProcessBatch.id == job).first() if job else q.order_by(AudioProcessBatch.id.desc()).first()
    if not batch:
        return None
    # 只按每曲目最终结果计数，重试记录不算完成；不会被最近 50 条限制截断。
    latest = db.query(func.max(AudioProcessEvent.id).label("id")).filter(
        AudioProcessEvent.job == batch.id, AudioProcessEvent.outcome != "retry",
    ).group_by(AudioProcessEvent.track_id).subquery()
    counts = dict(db.query(AudioProcessEvent.outcome, func.count()).filter(
        AudioProcessEvent.id.in_(db.query(latest.c.id)),
    ).group_by(AudioProcessEvent.outcome).all())
    done = sum(counts.values())
    return {
        "job": batch.id, "total": batch.total, "done": done,
        "success": counts.get("done", 0), "failed": counts.get("error", 0),
        "skipped": counts.get("skip", 0), "finished": done >= batch.total,
    }
