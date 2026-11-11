"""退款收尾：微信侧退款确认成功后统一走这里，保证订单状态、会员权益、
代理分成、礼物码四件事始终一致。后台「确认退款」「同步退款状态」和
退款结果通知回调三个入口共用，函数本身幂等。"""
import logging
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app import agent_service
from app import member_ledger
from app.models import Cdkey, Order, User

logger = logging.getLogger("uvicorn.error")


def refund_notify_url(cfg: dict) -> str | None:
    """退款结果通知地址：优先 pay_config.refund_notify_url，
    留空时按支付回调地址推导（…/pay/callback → …/pay/refund-callback），
    支付回调地址不是这个形态则不传，微信侧就只受理不通知（可靠 sync 兜底）。"""
    explicit = (cfg.get("refund_notify_url") or "").strip()
    if explicit:
        return explicit
    pay_url = cfg.get("notify_url") or ""
    suffix = "/api/mp/pay/callback"
    if pay_url.endswith(suffix):
        return pay_url[: -len(suffix)] + "/api/mp/pay/refund-callback"
    return None


def finalize_refund(db: Session, order: Order, operator: str) -> None:
    """订单置「已退款」并回收相关权益。仅在微信退款确认成功（或线下退款确认）后调用。"""
    if order.status == "refunded":  # 幂等：重复回调/重复确认直接返回
        return
    order.status = "refunded"
    order.refund_at = datetime.utcnow()
    if operator:
        order.refund_by = operator

    # 虚拟支付的累计时长按订单扣回；旧支付保持原套餐匹配规则。
    from app.user_merge import resolve_user
    user = None if order.is_gift else resolve_user(db, db.query(User).filter(User.id == order.user_id).first())
    if user:
        user = db.query(User).filter(User.id == user.id).populate_existing().with_for_update().one()
    handled = not order.is_gift and member_ledger.revoke(db, user, kind="order", ref=order.id)
    if not handled and not order.is_gift:
        handled = member_ledger.revoke_legacy_baseline(db, user, order)
    if (not handled and not order.is_gift and user and user.membership_source == "purchase"
            and (order.provider == "virtual" or user.membership_type == order.plan_id)):
        if order.provider == "virtual" and order.duration_days > 0 and user.membership_expire_at:
            user.membership_expire_at -= timedelta(days=order.duration_days)
        if not user.membership_expire_at or user.membership_expire_at <= datetime.utcnow() or order.provider != "virtual":
            user.membership_type = "free"
            user.membership_name = "听闻"
            user.membership_expire_at = None
            user.membership_source = ""

    # 礼物单：未兑换的码作废；已兑换的只撤销该码发放的天数。
    # 与兑换路径同样先锁码再锁受赠人，避免退款与兑换并发时漏回收或死锁。
    if order.is_gift and order.gift_code:
        key = db.query(Cdkey).filter(Cdkey.code == order.gift_code).with_for_update().first()
        if key and key.status == "unused":
            key.status = "disabled"
            key.remark = (key.remark or "") + f"｜订单 {order.order_no} 已退款作废"
        elif key and key.status == "used":
            recipient = resolve_user(db, db.get(User, key.used_by)) if key.used_by else None
            if recipient:
                recipient = db.query(User).filter_by(id=recipient.id).populate_existing().with_for_update().one()
            if member_ledger.revoke(db, recipient, kind="cdkey", ref=key.id):
                key.remark = (key.remark or "") + f"｜订单 {order.order_no} 已退款，兑换权益已撤销"
            else:
                key.remark = (key.remark or "") + f"｜订单 {order.order_no} 已退款，存量兑换权益待人工核对"
                logger.warning("礼物单 %s 退款，兑换码 %s 无逐笔权益记录，需人工核对", order.order_no, key.code)

    # 代理分成冲正：还没提走的直接作废；已提现的标记 clawback 由人工追讨
    agent_service.void_commission(db, order, reason=f"订单退款（{operator or 'system'}）")

    db.commit()
    db.refresh(order)
