import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Admin, Cdkey, Order, Plan, Track, User
from app.schemas import ok
from app.security import require_perm

router = APIRouter(prefix="/api/admin", tags=["users-stats"])


def _user_dict(u: User) -> dict:
    return {
        "id": u.id,
        "openid": u.openid,
        "unionid": u.unionid,
        "phone": u.phone,
        "nickname": u.nickname,
        "avatar": u.avatar,
        "element": u.element,
        "membership_type": u.membership_type,
        "membership_name": u.membership_name,
        "membership_source": u.membership_source,
        "membership_expire_at": (
            u.membership_expire_at.isoformat() if u.membership_expire_at else None
        ),
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


@router.get("/users")
def list_users(
    keyword: str | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("users:view")),
):
    q = db.query(User)
    if keyword:
        q = q.filter(User.nickname.contains(keyword))
    total = q.count()
    rows = q.order_by(User.id.desc()).offset((page - 1) * size).limit(size).all()
    return ok({"total": total, "items": [_user_dict(u) for u in rows]})


@router.get("/users/{user_id}")
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("users:view")),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    data = _user_dict(u)
    data["element_scores"] = json.loads(u.element_scores or "{}")
    data["quiz_completed_at"] = (
        u.quiz_completed_at.isoformat() if u.quiz_completed_at else None
    )
    # 该用户的订单
    orders = (
        db.query(Order)
        .filter(Order.user_id == user_id)
        .order_by(Order.id.desc())
        .all()
    )
    data["orders"] = [
        {
            "id": o.id,
            "order_no": o.order_no,
            "plan_name": o.plan_name,
            "amount": o.amount,
            "status": o.status,
            "created_at": o.created_at.isoformat() if o.created_at else None,
        }
        for o in orders
    ]
    return ok(data)


class GrantIn(BaseModel):
    plan_id: str            # month/year/trial（free 视为取消会员）
    days: int | None = None  # 不传则用套餐默认时长


@router.post("/users/{user_id}/grant")
def grant_membership(
    user_id: int,
    body: GrantIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("users:grant")),
):
    """后台给用户开通/赠送会员（不走支付，source=gift）。"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if body.plan_id == "free":
        user.membership_type = "free"
        user.membership_name = "听闻"
        user.membership_expire_at = None
        user.membership_source = ""
        db.commit()
        db.refresh(user)
        return ok(_user_dict(user))

    plan = db.query(Plan).filter(Plan.id == body.plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="套餐不存在")

    days = body.days if body.days is not None else plan.duration_days
    if days <= 0:
        raise HTTPException(status_code=400, detail="开通天数必须大于 0")

    # 若当前会员仍有效，则在剩余期上叠加；否则从现在起算
    now = datetime.utcnow()
    base = user.membership_expire_at if (user.membership_expire_at and user.membership_expire_at > now) else now
    user.membership_type = plan.id
    user.membership_name = plan.name
    user.membership_expire_at = base + timedelta(days=days)
    user.membership_source = "gift"
    db.commit()
    db.refresh(user)
    return ok(_user_dict(user))


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), _: Admin = Depends(require_perm("dashboard:view"))):
    return ok({
        "users": db.query(User).count(),
        "premium_users": db.query(User).filter(User.membership_type != "free").count(),
        "tracks": db.query(Track).count(),
        "cdkeys_total": db.query(Cdkey).count(),
        "cdkeys_used": db.query(Cdkey).filter(Cdkey.status == "used").count(),
        "orders_paid": db.query(Order).filter(Order.status == "paid").count(),
        "orders_refunded": db.query(Order).filter(Order.status == "refunded").count(),
    })
