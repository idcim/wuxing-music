"""独立心跳不受长时间转码阻塞；状态供后台及容器健康检查读取。"""
import logging
import socket
import threading
import uuid
from datetime import datetime, timedelta

from sqlalchemy import func, or_

from app.database import SessionLocal
from .common import migrated
from .models import Job, WorkerHeartbeat

HEARTBEAT_SECONDS = 15
STALE_SECONDS = 90
DELAY_SECONDS = 300


class WorkerMonitor:
    def __init__(self, sessions=SessionLocal, hostname=None, queue="all"):
        self.sessions = sessions
        self.hostname = hostname or socket.gethostname()
        self.queue = queue
        self.worker_id = uuid.uuid4().hex
        self._active = (None, None)
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread = None

    def active(self, job_id):
        with self._lock:
            self._active = (job_id, datetime.utcnow() if job_id is not None else None)

    def beat(self):
        with self.sessions() as db:
            if not migrated(db):
                return False
            now = datetime.utcnow()
            row = db.query(WorkerHeartbeat).filter_by(worker_id=self.worker_id).first()
            if row is None:
                row = WorkerHeartbeat(worker_id=self.worker_id, hostname=self.hostname, queue=self.queue)
                db.add(row)
            with self._lock:
                row.active_job_id, row.job_started_at = self._active
            row.last_seen = now
            # 仅清理运行状态，不删除业务任务或操作历史。
            db.query(WorkerHeartbeat).filter(WorkerHeartbeat.last_seen < now - timedelta(days=7)).delete()
            db.commit()
        return True

    def _run(self):
        while not self._stop.is_set():
            try:
                self.beat()
            except Exception:
                logging.exception("commerce worker heartbeat failed")
            self._stop.wait(HEARTBEAT_SECONDS)

    def __enter__(self):
        self._thread = threading.Thread(target=self._run, name="commerce-heartbeat", daemon=True)
        self._thread.start()
        return self

    def __exit__(self, *_):
        self._stop.set()
        self._thread.join(timeout=5)
        with self.sessions() as db:
            if migrated(db):
                db.query(WorkerHeartbeat).filter_by(worker_id=self.worker_id).delete()
                db.commit()


def local_healthy(db, hostname=None, now=None):
    if not migrated(db):
        return False
    now = now or datetime.utcnow()
    return db.query(WorkerHeartbeat.id).filter(
        WorkerHeartbeat.hostname == (hostname or socket.gethostname()),
        WorkerHeartbeat.last_seen >= now - timedelta(seconds=STALE_SECONDS),
    ).first() is not None


def snapshot(db, now=None):
    now = now or datetime.utcnow()
    counts = dict(db.query(Job.state, func.count(Job.id)).group_by(Job.state).all())
    workers = db.query(WorkerHeartbeat).order_by(WorkerHeartbeat.last_seen.desc()).limit(20).all()
    live = db.query(WorkerHeartbeat).filter(
        WorkerHeartbeat.last_seen >= now - timedelta(seconds=STALE_SECONDS)).all()
    queues = {queue: any(w.queue in (queue, "all") for w in live) for queue in ("transactions", "media")}
    oldest = db.query(func.min(Job.run_at)).filter(Job.state == "pending", Job.run_at <= now).scalar()
    return dict(online=all(queues.values()), online_count=len(live), queues=queues,
        workers=[dict(worker_id=w.worker_id, hostname=w.hostname, last_seen=w.last_seen,
            online=w.last_seen >= now - timedelta(seconds=STALE_SECONDS), queue=w.queue, active_job_id=w.active_job_id,
            job_started_at=w.job_started_at) for w in workers],
        jobs={state: counts.get(state, 0) for state in ("pending", "running", "failed", "done")},
        delayed=db.query(Job).filter(Job.state == "pending", Job.run_at < now - timedelta(seconds=DELAY_SECONDS)).count(),
        expired_leases=db.query(Job).filter(Job.state == "running",
            or_(Job.lease_until.is_(None), Job.lease_until < now)).count(),
        oldest_due_seconds=max(0, int((now - oldest).total_seconds())) if oldest else 0)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", required=True)
    parser.parse_args()
    with SessionLocal() as session:
        raise SystemExit(0 if local_healthy(session) else 1)
