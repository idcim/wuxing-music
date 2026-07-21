import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import wxpay
from app.database import get_db
from app.models import Admin, Order, Setting, User
from app.schemas import RefundIn, ok
from app.security import require_perm

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/admin/orders", tags=["orders"])


def _pay_cfg(db: Session) -> dict:
    row = db.query(Setting).filter(Setting.key == "pay_config").first()
    return json.loads(row.value) if row and row.value else {}


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


def _user_brief(u: User | None) -> dict | None:
    if not u:
        return None
    return {
        "id": u.id,
        "nickname": u.nickname,
        "avatar": u.avatar,
        "phone": u.phone,
        "openid": u.openid,
        "element": u.element,
        "membership_type": u.membership_type,
        "membership_name": u.membership_name,
        "membership_expire_at": (
            u.membership_expire_at.isoformat() if u.membership_expire_at else None
        ),
    }


@router.get("")
def list_orders(
    status: str | None = Query(None),
    order_no: str | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("orders:view")),
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
    _: Admin = Depends(require_perm("orders:view")),
):
    o = db.query(Order).filter(Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="订单不存在")
    user = db.query(User).filter(User.id == o.user_id).first()
    data = _to_dict(o)
    data["user"] = _user_brief(user)
    return ok(data)


@router.post("/{order_id}/refund")
def start_refund(
    order_id: int,
    body: RefundIn,
    db: Session = Depends(get_db),
    admin: Admin = Depends(require_perm("orders:refund")),
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
    admin: Admin = Depends(require_perm("orders:refund")),
):
    """确认退款完成：标记已退款，并回收该用户会员权益。"""
    o = db.query(Order).filter(Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="订单不存在")
    if o.status != "refunding":
        raise HTTPException(status_code=400, detail="仅退款中订单可确认")

    # 真实退款：支付已配置且有微信支付单号时，调微信退款 API；
    # 否则视为开发期/线下退款，仅改状态（兜底）。
    cfg = _pay_cfg(db)
    pay_enabled = bool(cfg.get("enabled")) and bool(cfg.get("wx_mch_id")) and bool(cfg.get("wx_key_pem"))
    if pay_enabled and o.transaction_id:
        try:
            wxpay.refund(
                cfg,
                transaction_id=o.transaction_id,
                out_refund_no="RF" + o.order_no,
                refund_fen=int(round((o.refund_amount or o.amount) * 100)),
                total_fen=int(round(o.amount * 100)),
                reason=o.refund_reason or "",
            )
        except wxpay.WxPayError as e:
            logger.warning("微信退款失败 订单 %s：%s", o.order_no, e)
            raise HTTPException(status_code=400, detail=f"微信退款失败：{e}")

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
