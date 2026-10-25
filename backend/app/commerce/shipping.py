from datetime import datetime, timezone
import httpx
from fastapi import HTTPException

from app.config import settings
from app.models import User
from app.routers.mp import _get_access_token
from .models import Order, OrderItem, Shipment


def call(db, action, payload):
    if not settings.commerce_shipping_approved:
        raise HTTPException(409, "微信发货与物流能力尚未配置验收")
    response = httpx.post("https://api.weixin.qq.com/" + action,
        params={"access_token": _get_access_token(db)}, json=payload, timeout=15)
    response.raise_for_status()
    data = response.json()
    if data.get("errcode", 0):
        raise RuntimeError(f"微信发货/物流接口失败 {data.get('errcode')}")
    return data


def sync(db, shipment_id):
    shipment = db.get(Shipment, shipment_id)
    order = db.get(Order, shipment.order_id)
    user = db.get(User, order.user_id)
    lines = db.query(OrderItem).filter_by(order_id=order.id).all()
    call(db, "wxa/sec/order/upload_shipping_info", dict(
        order_key=dict(order_number_type=2, transaction_id=order.transaction_id),
        logistics_type=1, delivery_mode=1,
        shipping_list=[dict(tracking_no=shipment.tracking_no, express_company=shipment.carrier,
            item_desc="、".join(f"{i.title}×{i.quantity - i.refund_quantity}" for i in lines)[:120],
            contact=dict(receiver_contact=order.address["phone"]))],
        upload_time=datetime.now(timezone.utc).isoformat(), payer=dict(openid=order.payer_openid)))
    shipment.sync_state, shipment.error = "synced", ""
    db.commit()


def trace(db, order, shipment):
    user = db.get(User, order.user_id)
    item = db.query(OrderItem).filter_by(order_id=order.id).first()
    # 返回微信物流查询组件 token，前端使用官方查询插件展示实际轨迹。
    return call(db, "cgi-bin/express/delivery/open_msg/trace_waybill", dict(openid=user.openid,
        waybill_id=shipment.tracking_no, delivery_id=shipment.carrier, receiver_phone=order.address["phone"],
        trans_id=order.transaction_id, order_detail_path=f"packages/shop/order/index?id={order.id}",
        goods_info=dict(detail_list=[dict(goods_name=item.title, goods_img_url=item.cover)])))


def confirm_receipt(db, order):
    data = call(db, "wxa/sec/order/get_order", {"transaction_id": order.transaction_id}).get("order", {})
    if data.get("transaction_id") != order.transaction_id or data.get("openid") != order.payer_openid or data.get("paid_amount") != order.amount_fen:
        raise RuntimeError("微信收货订单归属或金额不匹配")
    if data.get("order_state") not in (3, 4, 6):
        raise RuntimeError("微信尚未确认收货，请在微信组件中完成确认")
    from .common import record
    order.fulfillment = "received"
    record(db, order.order_no, "receipt_verified")
    db.commit()
