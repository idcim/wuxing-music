"""微信实体支付与数字内容支付隔离；所有缺配置路径均拒绝交易。"""
import base64
import hashlib
import hmac
import json
import time
from urllib.parse import quote

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException

from app import wxpay
from app.config import settings
from app.models import User
from app.routers.mp import _get_access_token, _mp_cfg, _pay_cfg, _site_name
from .models import Course, OrderItem, Payment
from .runtime_settings import resolve


def capabilities(db=None):
    from .logistics_settings import configured
    cfg = resolve(db, settings)
    return dict(physical_payment=bool(cfg.commerce_wxpay_public_key and cfg.commerce_wxpay_public_key_id and cfg.commerce_public_base),
        course_payment=bool(cfg.commerce_virtual_approved and cfg.commerce_virtual_offer_id and cfg.commerce_virtual_app_key
            and cfg.commerce_push_token and cfg.commerce_push_aes_key and cfg.commerce_public_base),
        course_ios=bool(cfg.commerce_virtual_ios_approved),
        private_media=bool(cfg.commerce_private_bucket and cfg.commerce_private_endpoint and cfg.commerce_private_key_id and cfg.commerce_private_key_secret),
        shipping=bool(cfg.commerce_shipping_approved),
        logistics=configured(db))


def pay_cfg(db, require_enabled=False):
    cfg = _pay_cfg(db)
    if (require_enabled and not cfg.get("enabled")) or not capabilities(db)["physical_payment"]:
        raise HTTPException(409, "实物支付尚未配置或验收")
    appid = _mp_cfg(db).get("app_id")
    if not appid:
        raise HTTPException(409, "小程序支付配置不完整")
    if not all(cfg.get(key) for key in ("wx_mch_id", "wx_key_pem", "wx_cert_serial", "wx_api_key")) or len(cfg["wx_api_key"].encode()) != 32:
        raise HTTPException(409, "商户支付证书、序列号或 APIv3 密钥配置不完整")
    return {**cfg, "wx_app_id": appid,
        "notify_url": resolve(db, settings).commerce_public_base.rstrip("/") + "/api/mp/v2/callbacks/wxpay"}


def verify_notification(headers, body, db=None):
    cfg = resolve(db, settings)
    try:
        timestamp = headers["wechatpay-timestamp"]
        if abs(time.time() - int(timestamp)) > 300:
            raise ValueError("timestamp")
        if headers["wechatpay-serial"] != cfg.commerce_wxpay_public_key_id:
            raise ValueError("serial")
        public_key = serialization.load_pem_public_key(cfg.commerce_wxpay_public_key.encode())
        message = timestamp.encode() + b"\n" + headers["wechatpay-nonce"].encode() + b"\n" + body + b"\n"
        public_key.verify(base64.b64decode(headers["wechatpay-signature"], validate=True), message,
                          padding.PKCS1v15(), hashes.SHA256())
    except Exception as exc:
        raise HTTPException(401, "支付通知签名无效") from exc


def wx_request(db, method, path, payload=None):
    cfg = pay_cfg(db)
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) if payload is not None else ""
    response = httpx.request(method, wxpay.WXPAY_BASE + path, content=body.encode(),
        headers=wxpay._headers(cfg, method, path, body), timeout=15)
    if response.status_code == 404 and response.json().get("code") == "ORDER_NOT_EXIST":
        return {"trade_state": "NOT_CREATED"}
    if response.status_code not in (200, 204):
        raise RuntimeError(f"微信支付请求失败 HTTP {response.status_code}")
    return response.json() if response.content else {}


def virtual_request(db, path, payload, session_key=None):
    # 停止新售卖不阻断历史订单查单、履约与退款。
    cfg = resolve(db, settings)
    if not cfg.commerce_virtual_app_key or not cfg.commerce_virtual_offer_id:
        raise HTTPException(409, "数字课程支付尚未获准或配置")
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    signature = hmac.new(cfg.commerce_virtual_app_key.encode(), (path + "&" + body).encode(), hashlib.sha256).hexdigest()
    params = {"access_token": _get_access_token(db), "pay_sig": signature}
    if session_key:
        params["signature"] = hmac.new(session_key.encode(), body.encode(), hashlib.sha256).hexdigest()
    response = httpx.post("https://api.weixin.qq.com" + path,
        params=params, content=body.encode(),
        headers={"Content-Type": "application/json"}, timeout=15)
    response.raise_for_status()
    data = response.json()
    if data.get("errcode", 0):
        if data.get("errcode") == 268490009:
            raise RuntimeError("微信退款授权已过期，请用户在订单页刷新退款授权后重试")
        raise RuntimeError(f"数字支付请求失败 {data.get('errcode')}")
    return data


def credential_cipher():
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256((settings.jwt_secret + "/commerce-session").encode()).digest()))


def refresh_refund_credential(db, order, code):
    if not code:
        raise HTTPException(422, "请刷新微信凭证后申请课程退款")
    mp = _mp_cfg(db)
    session = httpx.get("https://api.weixin.qq.com/sns/jscode2session", params={"appid": mp.get("app_id"),
        "secret": mp.get("app_secret"), "js_code": code, "grant_type": "authorization_code"}, timeout=15).json()
    if session.get("openid") != order.payer_openid or not session.get("session_key"):
        raise HTTPException(401, "微信退款身份校验失败，请重新登录")
    payment = db.query(Payment).filter_by(order_id=order.id).one()
    payment.credential = credential_cipher().encrypt(session["session_key"].encode()).decode()


def refund_session_key(db, order):
    payment = db.query(Payment).filter_by(order_id=order.id).one()
    try:
        return credential_cipher().decrypt(payment.credential.encode()).decode()
    except (InvalidToken, ValueError):
        raise RuntimeError("缺少有效退款授权，请用户在订单页刷新退款授权") from None


def preflight(db, order, platform="other"):
    user = db.get(User, order.user_id)
    if not user or user.deleted_at or not user.openid:
        raise HTTPException(409, "请使用有效微信账号登录")
    if order.provider == "wxpay":
        pay_cfg(db, require_enabled=True)
        if not capabilities(db)["shipping"]:
            raise HTTPException(409, "微信发货管理尚未验收")
    elif not capabilities(db)["course_payment"] or (platform == "ios" and not capabilities(db)["course_ios"]):
        raise HTTPException(409, "当前终端暂未开放课程购买")
    else:
        item = db.query(OrderItem).filter_by(order_id=order.id).one()
        course = db.get(Course, item.entity_id)
        if not course or course.revision != item.product_revision or course.payment_synced_revision != course.revision:
            raise HTTPException(409, "课程价格已更新，请取消待付款订单后重新结算")


def create_payment(db, order, code="", platform="other"):
    preflight(db, order, platform)
    if order.provider == "wxpay":
        cfg = pay_cfg(db)
        return {"provider": "wxpay", "payParams": wxpay.create_jsapi_order(cfg, openid=order.payer_openid,
            order_no=order.order_no, amount_fen=order.amount_fen, description=f"{_site_name(db)} · 商品订单", app_id=cfg["wx_app_id"])}
    if not capabilities(db)["course_payment"] or (platform == "ios" and not capabilities(db)["course_ios"]):
        raise HTTPException(409, "当前终端暂未开放课程购买")
    if not code:
        raise HTTPException(422, "请更新微信登录凭证")
    mp = _mp_cfg(db)
    session = httpx.get("https://api.weixin.qq.com/sns/jscode2session", params={"appid": mp.get("app_id"),
        "secret": mp.get("app_secret"), "js_code": code, "grant_type": "authorization_code"}, timeout=15).json()
    if session.get("openid") != order.payer_openid or not session.get("session_key"):
        raise HTTPException(401, "微信支付身份校验失败，请重新登录")
    db.query(Payment).filter_by(order_id=order.id).one().credential = credential_cipher().encrypt(session["session_key"].encode()).decode()
    item = db.query(OrderItem).filter_by(order_id=order.id).one()
    cfg = resolve(db, settings)
    signed = json.dumps(dict(offerId=cfg.commerce_virtual_offer_id, buyQuantity=1, env=0,
        currencyType="CNY", productId=item.payment_product, goodsPrice=item.price_fen,
        outTradeNo=order.order_no, attach=order.order_no), separators=(",", ":"), ensure_ascii=False)
    return dict(provider="virtual", payParams=dict(signData=signed, mode="short_series_goods",
        paySig=hmac.new(cfg.commerce_virtual_app_key.encode(), ("requestVirtualPayment&" + signed).encode(), hashlib.sha256).hexdigest(),
        signature=hmac.new(session["session_key"].encode(), signed.encode(), hashlib.sha256).hexdigest()))


def query_payment(db, order):
    if order.provider == "wxpay":
        cfg = pay_cfg(db)
        data = wx_request(db, "GET", f"/v3/pay/transactions/out-trade-no/{quote(order.order_no)}?mchid={cfg['wx_mch_id']}")
        if data.get("trade_state") == "SUCCESS":
            if data.get("appid") != cfg["wx_app_id"] or data.get("mchid") != cfg["wx_mch_id"]:
                raise RuntimeError("支付归属不匹配")
            return dict(paid=True, transaction_id=data["transaction_id"], amount_fen=data["amount"]["total"])
        return dict(paid=False, closed=data.get("trade_state") in ("CLOSED", "REVOKED", "NOT_CREATED"),
            exists=data.get("out_trade_no") == order.order_no and data.get("appid") == cfg["wx_app_id"] and data.get("mchid") == cfg["wx_mch_id"])
    data = virtual_request(db, "/xpay/query_order", {"openid": order.payer_openid, "env": 0, "order_id": order.order_no}).get("order", {})
    # 未识别的响应绝不当作成功，留给持久任务重试与人工核对。
    if data.get("status") in (2, 3, 4, 5, 8):
        if data.get("order_id") != order.order_no or data.get("order_fee") != order.amount_fen or data.get("paid_fee") != order.amount_fen:
            raise RuntimeError("数字支付订单或金额校验失败")
    if data.get("status") in (2, 3, 4):
        return dict(paid=True, transaction_id=data["wx_order_id"], amount_fen=data["paid_fee"])
    return dict(paid=False, closed=data.get("status") == 6,
        exists=data.get("order_id") == order.order_no and data.get("status") in (1, 2, 3, 4, 5, 6, 7, 8),
        refunded=data.get("status") == 8 and data.get("left_fee") == 0,
        transaction_id=data.get("wx_order_id"), amount_fen=data.get("paid_fee"))


def close_payment(db, order):
    if order.provider == "virtual":
        # 数字订单不释放实物库存。必须等渠道明确关闭，不猜测未知渠道状态。
        return query_payment(db, order).get("closed", False)
    cfg = pay_cfg(db)
    wx_request(db, "POST", f"/v3/pay/transactions/out-trade-no/{quote(order.order_no)}/close", {"mchid": cfg["wx_mch_id"]})
    return query_payment(db, order).get("closed", False)


def confirm_course_delivery(db, order):
    if order.status != "paid":
        return
    data = virtual_request(db, "/xpay/query_order", {"openid": order.payer_openid, "env": 0, "order_id": order.order_no}).get("order", {})
    if data.get("status") == 4:
        return
    virtual_request(db, "/xpay/notify_provide_goods", {"order_id": order.order_no, "env": 0})
