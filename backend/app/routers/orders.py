from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Admin, Order, User
from app.schemas import RefundIn, ok
from app.security import get_current_admin

router = APIRouter(prefix="/api/admin/orders", tags=["orders"])


def _to_dict(o: Order) -> dict:
    return {
        "id": o.id,
        "order_no": o.order_no,
        "user_id": o.user_id,
        "plan_id": o.plan_id,
        "plan_name": o.plan_name,
        "amount": o.amount,
        "status": o.status,
        "paid_at": o.paid_at.isoformat() if o.paid_at else None,
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "refund_amount": o.refund_amount,
        "refund_reason": o.refund_reason,
        "refund_at": o.refund_at.isoformat() if o.refund_at else None,
        "refund_by": o.refund_by,
    }


@router.get("")
def list_orders(
    status: str | None = Query(None),
    order_no: str | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    q = db.query(Order)
    if status:
        q = q.filter(Order.status == status)
    if order_no:
        q = q.filter(Order.order_no.contains(order_no))
    total = q.count()
    rows = q.order_by(Order.id.desc()).offset((page - 1) * size).limit(size).all()
    return ok({"total": total, "items": [_to_dict(o) for o in rows]})


@router.get("/{order_id}")
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    o = db.query(Order).filter(Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="订单不存在")
    return ok(_to_dict(o))


@router.post("/{order_id}/refund")
def start_refund(
    order_id: int,
    body: RefundIn,
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    """发起退款：仅已支付订单可退，标记为退款中。"""
    o = db.query(Order).filter(Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="订单不存在")
    if o.status != "paid":
        raise HTTPException(status_code=400, detail=f"当前状态 {o.status} 不可退款，仅已支付订单可退")

    amount = body.amount if body.amount is not None else o.amount
    if amount <= 0 or amount > o.amount:
        raise HTTPException(status_code=400, detail="退款金额不合法")

    o.status = "refunding"
    o.refund_amount = amount
    o.refund_reason = body.reason
    o.refund_by = admin.username
    db.commit()
    db.refresh(o)
    return ok(_to_dict(o))


@router.post("/{order_id}/refund/confirm")
def confirm_refund(
    order_id: int,
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    """确认退款完成：标记已退款，并回收该用户会员权益。"""
    o = db.query(Order).filter(Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="订单不存在")
    if o.status != "refunding":
        raise HTTPException(status_code=400, detail="仅退款中订单可确认")

    o.status = "refunded"
    o.refund_at = datetime.utcnow()
    o.refund_by = admin.username

    # 回收会员权益：若用户当前会员来自购买，降级为免费
    user = db.query(User).filter(User.id == o.user_id).first()
    if user and user.membership_source == "purchase" and user.membership_type == o.plan_id:
        user.membership_type = "free"
        user.membership_name = "听闻"
        user.membership_expire_at = None
        user.membership_source = ""

    db.commit()
    db.refresh(o)
    return ok(_to_dict(o))
