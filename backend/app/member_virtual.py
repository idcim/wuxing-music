"""小程序音乐会员与礼物卡的虚拟支付；旧 JSAPI 订单仍留在原支付链路。"""
import hashlib
import hmac
import json
from datetime import datetime, timedelta

import httpx
from fastapi import HTTPException

from app import agent_service, refund_service
from app.config import settings
from app.models import Cdkey, Order, User


def ready(db, plan=None):
    from app.commerce.providers import capabilities
    from app.commerce.runtime_settings import resolve
    cfg = resolve(db, settings)
    enabled = capabilities(db)["course_payment"]
    if plan is not None:
        enabled = enabled and bool(plan.virtual_product and plan.virtual_price_synced
            and plan.price > 0 and plan.duration_days > 0)
    return bool(enabled), cfg


def price_fen(plan):
    from decimal import Decimal, ROUND_HALF_UP
    return int((Decimal(str(plan.price)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def create_params(db, order, code, platform):
    from app.routers.mp import _mp_cfg
    enabled, cfg = ready(db)
    if not enabled or (platform == "ios" and not cfg.commerce_virtual_ios_approved):
        raise HTTPException(409, "当前终端暂未开放会员购买")
    if not code:
        raise HTTPException(422, "请更新微信登录凭证")
    mp = _mp_cfg(db)
    try:
        response = httpx.get("https://api.weixin.qq.com/sns/jscode2session", params={
            "appid": mp.get("app_id"), "secret": mp.get("app_secret"),
            "js_code": code, "grant_type": "authorization_code"}, timeout=15)
        response.raise_for_status()
        session = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(502, "微信身份校验暂不可用") from exc
    if session.get("openid") != order.payer_openid or not session.get("session_key"):
        raise HTTPException(401, "微信支付身份校验失败，请重新登录")
    from app.commerce.providers import credential_cipher
    order.refund_credential = credential_cipher().encrypt(session["session_key"].encode()).decode()
    signed = json.dumps(dict(offerId=cfg.commerce_virtual_offer_id, buyQuantity=1, env=0,
        currencyType="CNY", productId=order.payment_product, goodsPrice=order.amount_fen,
        outTradeNo=order.order_no, attach=order.order_no), separators=(",", ":"), ensure_ascii=False)
    order.payment_platform = platform
    return dict(signData=signed, mode="short_series_goods",
        paySig=hmac.new(cfg.commerce_virtual_app_key.encode(), ("requestVirtualPayment&" + signed).encode(), hashlib.sha256).hexdigest(),
        signature=hmac.new(session["session_key"].encode(), signed.encode(), hashlib.sha256).hexdigest())


def query(db, order):
    from app.commerce.providers import virtual_request
    data = virtual_request(db, "/xpay/query_order", {
        "openid": order.payer_openid, "env": 0, "order_id": order.order_no}).get("order", {})
    status = data.get("status")
    if status in (2, 3, 4, 5, 8):
        if (data.get("order_id") != order.order_no or data.get("order_fee") != order.amount_fen
                or data.get("paid_fee") != order.amount_fen):
            raise HTTPException(409, "数字支付订单或金额校验失败")
    return dict(paid=status in (2, 3, 4), closed=status == 6,
        refunded=status == 8 and data.get("left_fee") == 0,
        transaction_id=data.get("wx_order_id"), amount_fen=data.get("paid_fee"))


def settle(db, order, result):
    order = db.query(Order).filter_by(id=order.id).populate_existing().with_for_update().one()
    if order.provider != "virtual" or not result.get("paid"):
        raise HTTPException(409, "数字支付状态未确认")
    if order.status == "paid":
        return
    if order.status != "pending" or result.get("amount_fen") != order.amount_fen or not result.get("transaction_id"):
        raise HTTPException(409, "订单状态或金额不匹配")
    if order.is_gift:
        from app.routers.mp import _gen_gift_code
        for _ in range(50):
            code = _gen_gift_code()
            if not db.query(Cdkey).filter_by(code=code).first():
                db.add(Cdkey(code=code, batch_id="gift", plan_type=order.plan_id,
                    duration_days=order.duration_days, plan_name=order.plan_name,
                    remark=f"礼物订单 {order.order_no}"))
                order.gift_code = code
                break
        if not order.gift_code:
            raise HTTPException(500, "礼物码生成失败")
    else:
        from app.user_merge import resolve_user
        user = resolve_user(db, db.get(User, order.user_id))
        if not user or user.deleted_at:
            raise HTTPException(409, "付款账号已注销，需人工处理")
        now = datetime.utcnow()
        base = user.membership_expire_at if user.membership_expire_at and user.membership_expire_at > now else now
        user.membership_type = order.plan_id
        user.membership_name = order.plan_name
        user.membership_expire_at = base + timedelta(days=order.duration_days)
        user.membership_source = "purchase"
    order.status = "paid"
    order.transaction_id = str(result["transaction_id"])
    order.paid_at = datetime.utcnow()
    agent_service.record_commission(db, order)
    from app.commerce.common import enqueue, guard_claim
    enqueue(db, f"member-delivery:{order.id}", "member_delivery", {"order_id": order.id})
    guard_claim(db)
    db.commit()


def confirm_delivery(db, order):
    if order and order.status == "paid" and order.provider == "virtual":
        from app.commerce.providers import virtual_request
        current = virtual_request(db, "/xpay/query_order", {
            "openid": order.payer_openid, "env": 0, "order_id": order.order_no}).get("order", {})
        if current.get("status") == 4:
            return
        virtual_request(db, "/xpay/notify_provide_goods", {"order_id": order.order_no, "env": 0})


def receive(db, order, event, message):
    if message.findtext("OpenId", message.findtext("FromUserName", "")) != order.payer_openid:
        raise HTTPException(409, "数字支付身份不符")
    result = query(db, order)
    if event == "xpay_goods_deliver_notify":
        if message.findtext("GoodsInfo/ProductId") != order.payment_product or message.findtext("GoodsInfo/Quantity") != "1":
            raise HTTPException(409, "数字支付商品不匹配")
        if order.status == "refunded" and result.get("refunded"):
            return
        settle(db, order, result)
    elif event == "xpay_refund_notify":
        if result.get("refunded") and order.status in ("paid", "refunding") and result.get("transaction_id") == order.transaction_id:
            order.refund_amount = order.amount
            order.refund_reason = order.refund_reason or "支付渠道确认退款"
            refund_service.finalize_refund(db, order, order.refund_by or "渠道")
        elif order.status != "refunded":
            raise HTTPException(409, "退款结果尚未由渠道确认")


def refresh_refund_credential(db, order, code):
    from app.commerce.providers import credential_cipher
    from app.routers.mp import _mp_cfg
    mp = _mp_cfg(db)
    try:
        response = httpx.get("https://api.weixin.qq.com/sns/jscode2session", params={
            "appid": mp.get("app_id"), "secret": mp.get("app_secret"),
            "js_code": code, "grant_type": "authorization_code"}, timeout=15)
        response.raise_for_status()
        session = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(502, "微信身份校验暂不可用") from exc
    if session.get("openid") != order.payer_openid or not session.get("session_key"):
        raise HTTPException(401, "微信退款身份校验失败")
    order.refund_credential = credential_cipher().encrypt(session["session_key"].encode()).decode()
    db.commit()


def refund_session_key(order):
    from cryptography.fernet import InvalidToken
    from app.commerce.providers import credential_cipher
    try:
        return credential_cipher().decrypt(order.refund_credential.encode()).decode()
    except (InvalidToken, ValueError, AttributeError) as exc:
        raise HTTPException(409, "退款授权已过期，请买家在小程序订单页刷新") from exc
