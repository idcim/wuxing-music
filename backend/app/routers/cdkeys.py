import secrets
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Admin, Cdkey
from app.schemas import CdkeyGenerateIn, ok
from app.security import require_perm

router = APIRouter(prefix="/api/admin/cdkeys", tags=["cdkeys"])

# 去除易混字符 0/O/1/I
CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _gen_segment(n: int = 4) -> str:
    return "".join(secrets.choice(CHARSET) for _ in range(n))


def _gen_code(prefix: str) -> str:
    year = datetime.utcnow().year
    return f"{prefix}-{year}-{_gen_segment()}-{_gen_segment()}"


def _to_dict(c: Cdkey) -> dict:
    return {
        "id": c.id,
        "code": c.code,
        "batch_id": c.batch_id,
        "plan_type": c.plan_type,
        "duration_days": c.duration_days,
        "plan_name": c.plan_name,
        "status": c.status,
        "used_by": c.used_by,
        "remark": c.remark,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


@router.get("")
def list_cdkeys(
    status: str | None = Query(None),
    batch_id: str | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("cdkeys:view")),
):
    q = db.query(Cdkey)
    if status:
        q = q.filter(Cdkey.status == status)
    if batch_id:
        q = q.filter(Cdkey.batch_id == batch_id)
    total = q.count()
    rows = (
        q.order_by(Cdkey.id.desc())
        .offset((page - 1) * size)
        .limit(size)
        .all()
    )
    return ok({"total": total, "items": [_to_dict(c) for c in rows]})


@router.post("/generate")
def generate_cdkeys(
    body: CdkeyGenerateIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("cdkeys:manage")),
):
    batch_id = uuid.uuid4().hex[:12]
    expire_at = None
    if body.expire_at:
        try:
            expire_at = datetime.fromisoformat(body.expire_at)
        except ValueError:
            raise HTTPException(status_code=400, detail="expire_at 格式应为 ISO 时间")

    created: list[Cdkey] = []
    existing = {c.code for c in db.query(Cdkey.code).all()}
    attempts = 0
    while len(created) < body.count:
        attempts += 1
        if attempts > body.count * 20:
            raise HTTPException(status_code=500, detail="生成唯一码失败，请重试")
        code = _gen_code(body.prefix)
        if code in existing:
            continue
        existing.add(code)
        c = Cdkey(
            code=code,
            batch_id=batch_id,
            plan_type=body.plan_type,
            duration_days=body.duration_days,
            plan_name=body.plan_name,
            expire_at=expire_at,
            remark=body.remark,
        )
        db.add(c)
        created.append(c)
    db.commit()
    return ok({
        "batch_id": batch_id,
        "count": len(created),
        "codes": [c.code for c in created],
    })


@router.post("/{cdkey_id}/disable")
def disable_cdkey(
    cdkey_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("cdkeys:manage")),
):
    c = db.query(Cdkey).filter(Cdkey.id == cdkey_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="兑换码不存在")
    if c.status == "used":
        raise HTTPException(status_code=400, detail="已使用的兑换码不可禁用")
    c.status = "disabled"
    db.commit()
    return ok(_to_dict(c))
