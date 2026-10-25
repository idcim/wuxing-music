import base64
import hashlib
import hmac
import json
import struct
import time
import xml.etree.ElementTree as ET

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse, Response
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app import wxpay
from app.config import settings
from app.database import get_db
from app.models import User
from app.routers.mp import _mp_cfg
from . import aftersales, providers, trading
from .common import ready, record
from .models import AfterSale, Order, OrderItem

router = APIRouter(prefix="/api/mp/v2/callbacks", tags=["commerce-callback"], dependencies=[Depends(ready)])


async def read_body(request):
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > 1024 * 1024:
            raise HTTPException(413)
        chunks.append(chunk)
    return b"".join(chunks)


def notification(raw, headers, db):
    providers.verify_notification(headers, raw)
    return wxpay.decrypt_callback_resource(providers.pay_cfg(db)["wx_api_key"], json.loads(raw)["resource"])


@router.post("/wxpay")
async def paid(request: Request, db: Session = Depends(get_db)):
    return await run_in_threadpool(accept_payment, await read_body(request), request.headers, db)


def accept_payment(raw, headers, db):
    data = notification(raw, headers, db)
    cfg = providers.pay_cfg(db)
    if data.get("appid") != cfg["wx_app_id"] or data.get("mchid") != cfg["wx_mch_id"]:
        raise HTTPException(409, "支付归属不符")
    order = db.query(Order).filter_by(order_no=data.get("out_trade_no"), provider="wxpay").first()
    if not order:
        raise HTTPException(404, "交易不存在")
    if data.get("trade_state") == "SUCCESS":
        user = db.get(User, order.user_id)
        # 已注销账号也保留财务状态，但不信任前端或通知中的陌生付款人。
        if user and not user.deleted_at and (data.get("payer") or {}).get("openid") != order.payer_openid:
            raise HTTPException(409, "付款身份不符")
        if data.get("amount", {}).get("currency", "CNY") != "CNY":
            raise HTTPException(409, "币种不匹配")
        trading.settle_paid(db, order.id, data.get("transaction_id"), data.get("amount", {}).get("total"))
        db.commit()
    return Response(status_code=204)


@router.post("/refund")
async def refunded(request: Request, db: Session = Depends(get_db)):
    return await run_in_threadpool(accept_refund, await read_body(request), request.headers, db)


def accept_refund(raw, headers, db):
    data = notification(raw, headers, db)
    if data.get("mchid") != providers.pay_cfg(db)["wx_mch_id"]:
        raise HTTPException(409, "退款商户不匹配")
    sale = db.query(AfterSale).filter_by(refund_no=data.get("out_refund_no")).first()
    if not sale:
        raise HTTPException(404, "退款记录不存在")
    order = db.get(Order, sale.order_id)
    if (data.get("out_trade_no") != order.order_no or data.get("transaction_id") != order.transaction_id
            or data.get("amount", {}).get("refund") != sale.amount_fen
            or data.get("amount", {}).get("total") != order.amount_fen):
        raise HTTPException(409, "退款金额或订单不匹配")
    if data.get("refund_status") == "SUCCESS":
        aftersales.finalize(db, sale.id)
        db.commit()
    return Response(status_code=204)


def verify_push(query, encrypted):
    token = settings.commerce_push_token
    if not token:
        raise HTTPException(409, "数字支付消息推送未配置")
    try:
        timestamp, nonce = query["timestamp"], query["nonce"]
        if abs(time.time() - int(timestamp)) > 300:
            raise ValueError()
        expected = hashlib.sha1("".join(sorted([token, timestamp, nonce] + ([encrypted] if encrypted else []))).encode()).hexdigest()
        if not hmac.compare_digest(expected, query.get("msg_signature" if encrypted else "signature", "")):
            raise ValueError()
    except Exception as exc:
        raise HTTPException(401, "消息签名不合法") from exc


@router.get("/virtual")
def virtual_challenge(request: Request):
    verify_push(request.query_params, "")
    return PlainTextResponse(request.query_params.get("echostr", ""))


@router.post("/virtual")
async def virtual_callback(request: Request, db: Session = Depends(get_db)):
    return await run_in_threadpool(accept_virtual, await read_body(request), dict(request.query_params), db)


def accept_virtual(raw, query, db):
    if len(raw) > 1024 * 1024 or b"<!DOCTYPE" in raw:
        raise HTTPException(422)
    outer = ET.fromstring(raw)
    encrypted = outer.findtext("Encrypt", "")
    verify_push(query, encrypted)
    if not encrypted:
        raise HTTPException(401, "数字支付仅接受加密消息")
    try:
        key = base64.b64decode(settings.commerce_push_aes_key + "=")
        decryptor = Cipher(algorithms.AES(key), modes.CBC(key[:16])).decryptor()
        plain = decryptor.update(base64.b64decode(encrypted)) + decryptor.finalize()
        padding_size = plain[-1]
        if not 1 <= padding_size <= 32 or plain[-padding_size:] != bytes([padding_size]) * padding_size:
            raise ValueError()
        plain = plain[:-padding_size]
        length = struct.unpack("!I", plain[16:20])[0]
        if plain[20 + length:].decode() != _mp_cfg(db).get("app_id"):
            raise ValueError()
        message = ET.fromstring(plain[20:20 + length])
    except Exception as exc:
        raise HTTPException(401, "数字支付消息解密失败") from exc
    event = message.findtext("Event", "")
    order = db.query(Order).filter_by(order_no=message.findtext("OutTradeNo", ""), provider="virtual").first()
    if event in ("xpay_goods_deliver_notify", "xpay_refund_notify"):
        if not order:
            raise HTTPException(404, "数字支付订单不存在")
        user = db.get(User, order.user_id)
        if message.findtext("OpenId", message.findtext("FromUserName", "")) != order.payer_openid:
            raise HTTPException(409, "数字支付身份不符")
        result = providers.query_payment(db, order)
        if event == "xpay_goods_deliver_notify":
            item = db.query(OrderItem).filter_by(order_id=order.id).one()
            if message.findtext("GoodsInfo/ProductId") != item.payment_product or message.findtext("GoodsInfo/Quantity") != "1":
                raise HTTPException(409, "数字支付商品不匹配")
            if not result.get("paid"):
                raise HTTPException(409, "支付结果尚未确认")
            trading.settle_paid(db, order.id, result["transaction_id"], result["amount_fen"])
        elif result.get("refunded"):
            if result.get("transaction_id") != order.transaction_id:
                raise HTTPException(409, "渠道退款交易不匹配")
            sale = db.query(AfterSale).filter_by(order_id=order.id, state="refunding").first()
            if not sale:
                sale = aftersales.channel_course_refund(db, order)
            aftersales.finalize(db, sale.id)
        else:
            raise HTTPException(409, "退款结果尚未由渠道确认，请重试通知")
        record(db, order.order_no, event)
        db.commit()
    return Response(content="<xml><ErrCode>0</ErrCode><ErrMsg>success</ErrMsg></xml>", media_type="application/xml")
