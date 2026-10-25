from datetime import datetime

from fastapi import Depends, HTTPException
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Setting
from .models import Event, Job, SCHEMA_VERSION, SchemaVersion

DEFAULTS = dict(courses_visible=False, shop_visible=False, courses_sale=False, shop_sale=False,
                course_banner="", shop_banner="", course_banner_course_id=None, shop_banner_product_id=None,
                provinces=[], shipping_fen=0, free_shipping_fen=None, customer_service="",
                return_address="", course_policy="", physical_policy="")


class RetryLater(RuntimeError):
    """渠道正常处理中；继续持久补查，不消耗异常重试次数。"""


class LeaseLost(RuntimeError):
    """旧执行已失去租约，必须放弃本地写入，不能覆盖接管者的结果。"""


def guard_claim(db):
    claim = db.info.get("commerce_claim")
    if claim is None:
        return  # 普通 API/回调事务不属于后台任务。
    ident, attempt, lease_until = claim
    # 不刷新整个 ORM 对象，以免覆盖业务事务中尚未提交的字段修改。
    with db.no_autoflush:
        owned = db.query(Job.id).filter(Job.id == ident, Job.state == "running",
            Job.attempts == attempt, Job.lease_until == lease_until,
            Job.lease_until > datetime.utcnow()).with_for_update().first()
    if owned is None:
        raise LeaseLost("任务租约已到期或已由其他执行接管")


def ok(data=None):
    return {"code": 0, "data": data, "msg": "ok"}


def throttle(uid, action, limit=30):
    from app.ratelimit import check_and_record
    if not check_and_record(f"commerce:{action}:{uid}", limit, 60):
        raise HTTPException(429, "操作过于频繁，请稍后再试")


def migrated(db):
    if not inspect(db.get_bind()).has_table(SchemaVersion.__tablename__):
        return False
    return db.get(SchemaVersion, SCHEMA_VERSION) is not None


def ready(db: Session = Depends(get_db)):
    if not migrated(db):
        raise HTTPException(503, "课程商城尚未完成数据库迁移")


def config(db):
    row = db.query(Setting).filter_by(key="commerce_config").first()
    import json
    return {**DEFAULTS, **(json.loads(row.value) if row and row.value else {})}


def enabled(db, kind, sale=False):
    cfg = config(db)
    prefix = "courses" if kind == "course" else "shop"
    if not cfg[f"{prefix}_visible"]:
        raise HTTPException(404, "该模块暂未开放")
    if sale and not cfg[f"{prefix}_sale"]:
        raise HTTPException(409, "暂未开放购买")
    return cfg


def record(db, subject, action, detail=None, operator=""):
    db.add(Event(subject=subject, action=action, detail=detail or {}, operator=operator))


def enqueue(db, key, kind, payload, run_at=None):
    if not db.query(Job).filter_by(key=key).first():
        db.add(Job(key=key, kind=kind, payload=payload, run_at=run_at or datetime.utcnow()))


def require_row(db, model, ident):
    row = db.get(model, ident)
    if row is None:
        raise HTTPException(404, "记录不存在")
    return row


def serialize(row, exclude=()):
    return {c.name: getattr(row, c.name) for c in row.__table__.columns if c.name not in exclude}
