from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Admin, Cdkey, Order, Track, User
from app.schemas import ok
from app.security import get_current_admin

router = APIRouter(prefix="/api/admin", tags=["users-stats"])


def _user_dict(u: User) -> dict:
    return {
        "id": u.id,
        "openid": u.openid,
        "nickname": u.nickname,
        "element": u.element,
        "membership_type": u.membership_type,
        "membership_name": u.membership_name,
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
    _: Admin = Depends(get_current_admin),
):
    q = db.query(User)
    if keyword:
        q = q.filter(User.nickname.contains(keyword))
    total = q.count()
    rows = q.order_by(User.id.desc()).offset((page - 1) * size).limit(size).all()
    return ok({"total": total, "items": [_user_dict(u) for u in rows]})


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), _: Admin = Depends(get_current_admin)):
    return ok({
        "users": db.query(User).count(),
        "premium_users": db.query(User).filter(User.membership_type != "free").count(),
        "tracks": db.query(Track).count(),
        "cdkeys_total": db.query(Cdkey).count(),
        "cdkeys_used": db.query(Cdkey).filter(Cdkey.status == "used").count(),
        "orders_paid": db.query(Order).filter(Order.status == "paid").count(),
    })
