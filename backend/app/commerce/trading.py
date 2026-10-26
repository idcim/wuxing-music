import uuid
import hashlib
import json
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import update

from .catalog import has_access
from .common import enabled, enqueue, guard_claim, record, require_row, serialize
from .models import Address, Course, Enrollment, InventoryLog, Order, OrderItem, Payment, Product, Sku


def quote(db, uid, body):
    cfg = enabled(db, body.kind, sale=True)
    lines, address, shipping = [], {}, 0
    if body.kind == "course":
        course = require_row(db, Course, body.course_id)
        if course.status != "published" or not course.price_fen:
            raise HTTPException(409, "课程暂不可购买；免费课程请直接领取")
        if has_access(db, uid, course.id):
            raise HTTPException(409, "你已获得这门课程")
        if course.payment_synced_revision != course.revision:
            raise HTTPException(409, "课程价格正在更新")
        lines.append(dict(entity_id=course.id, title=course.title, spec="", cover=course.cover,
            price_fen=course.price_fen, quantity=1, access_days=course.access_days,
            product_revision=course.revision, payment_product=course.payment_product))
    else:
        if not body.items or len({i.sku_id for i in body.items}) != len(body.items):
            raise HTTPException(422, "请选择商品，规格不可重复")
        addr = require_row(db, Address, body.address_id)
        if addr.user_id != uid:
            raise HTTPException(404, "收货地址不存在")
        if addr.province not in cfg["provinces"]:
            raise HTTPException(409, "该地区暂不支持配送")
        address = serialize(addr, ("id", "user_id", "created_at"))
        for item in sorted(body.items, key=lambda i: i.sku_id):
            sku = require_row(db, Sku, item.sku_id)
            product = require_row(db, Product, sku.product_id)
            if not sku.enabled or product.status != "published" or sku.price_fen <= 0:
                raise HTTPException(409, "商品已下架或规格不可用")
            if sku.stock - sku.reserved < item.quantity:
                raise HTTPException(409, f"{product.title} 库存不足")
            lines.append(dict(entity_id=sku.id, title=product.title, spec=sku.name, cover=product.cover,
                price_fen=sku.price_fen, quantity=item.quantity))
        subtotal = sum(i["price_fen"] * i["quantity"] for i in lines)
        threshold = cfg["free_shipping_fen"]
        shipping = 0 if threshold is not None and subtotal >= threshold else cfg["shipping_fen"]
    total = sum(i["price_fen"] * i["quantity"] for i in lines) + shipping
    if total > 100000000:
        raise HTTPException(422, "订单金额超过限制")
    return dict(items=lines, address=address, shipping_fen=shipping, amount_fen=total)


def create_order(db, uid, body):
    fingerprint = hashlib.sha256(json.dumps(body.model_dump(exclude={"request_key"}), sort_keys=True).encode()).hexdigest()
    existing = db.query(Order).filter_by(user_id=uid, request_key=body.request_key).first()
    if existing:
        if existing.request_hash != fingerprint:
            raise HTTPException(409, "重复请求的订单内容已变化，请重新结算")
        return existing
    if body.kind == "course" and db.query(Order).join(OrderItem, OrderItem.order_id == Order.id).filter(
        Order.user_id == uid, Order.kind == "course", Order.status.in_(["pending", "closing"]),
        OrderItem.entity_id == body.course_id).first():
        raise HTTPException(409, "已有待付款课程订单，请到我的订单继续处理")
    data = quote(db, uid, body)
    from app.models import User
    payer = db.get(User, uid)
    if body.quoted_fen != data["amount_fen"]:
        raise HTTPException(409, "价格或运费已变化，请重新确认")
    order = Order(order_no="C" + uuid.uuid4().hex[:30], user_id=uid, request_key=body.request_key, request_hash=fingerprint,
        kind=body.kind, payer_openid=payer.openid, amount_fen=data["amount_fen"], shipping_fen=data["shipping_fen"],
        address=data["address"], provider="virtual" if body.kind == "course" else "wxpay",
        expires_at=datetime.utcnow() + timedelta(minutes=30))
    db.add(order)
    db.flush()
    for line in data["items"]:
        if body.kind == "physical":
            count = db.execute(update(Sku).where(Sku.id == line["entity_id"], Sku.enabled.is_(True), Sku.price_fen == line["price_fen"],
                Sku.stock - Sku.reserved >= line["quantity"]).values(reserved=Sku.reserved + line["quantity"])).rowcount
            if count != 1:
                raise HTTPException(409, "库存已变化，请重新结算")
        db.add(OrderItem(order_id=order.id, **line))
    db.add(Payment(order_id=order.id))
    enqueue(db, f"close:{order.id}", "close", {"order_id": order.id}, order.expires_at)
    enqueue(db, f"check:{order.id}", "payment", {"order_id": order.id}, datetime.utcnow() + timedelta(minutes=1))
    record(db, order.order_no, "created", {"amount_fen": order.amount_fen}, str(uid))
    db.commit()
    return order


def grant(db, uid, course_id, source, days):
    if db.query(Enrollment).filter_by(user_id=uid, course_id=course_id, source=source).first():
        return
    db.add(Enrollment(user_id=uid, course_id=course_id, source=source,
        expires_at=datetime.utcnow() + timedelta(days=days) if days else None))


def settle_paid(db, order_id, transaction_id, amount_fen):
    guard_claim(db)
    order = db.query(Order).filter_by(id=order_id).populate_existing().with_for_update().one()
    if amount_fen != order.amount_fen or not transaction_id:
        raise HTTPException(409, "支付金额或交易标识不匹配")
    if order.status == "paid" or order.status == "refunded":
        if order.transaction_id != transaction_id:
            raise HTTPException(409, "交易标识冲突")
        return order
    if order.status not in ("pending", "closing"):
        raise HTTPException(409, "已关闭订单收到支付，请人工核对")
    # CAS 同时兼容 SQLite 回归与 MySQL，所有履约与支付状态在一个事务提交。
    count = db.execute(update(Order).where(Order.id == order.id, Order.status.in_(["pending", "closing"]))
        .values(status="paid", transaction_id=transaction_id, paid_at=datetime.utcnow(),
                fulfillment="ready" if order.kind == "course" else "unshipped")).rowcount
    if count != 1:
        db.expire_all()
        return db.get(Order, order_id)
    for item in db.query(OrderItem).filter_by(order_id=order_id).all():
        if order.kind == "course":
            grant(db, order.user_id, item.entity_id, order.order_no, item.access_days)
        else:
            changed = db.execute(update(Sku).where(Sku.id == item.entity_id, Sku.reserved >= item.quantity,
                Sku.stock >= item.quantity).values(stock=Sku.stock - item.quantity, reserved=Sku.reserved - item.quantity)).rowcount
            if changed != 1:
                raise HTTPException(409, "预占库存异常，订单需核对")
            db.add(InventoryLog(sku_id=item.entity_id, delta=-item.quantity, reason=order.order_no))
    payment = db.query(Payment).filter_by(order_id=order_id).one()
    payment.state = "paid"
    if order.provider == "virtual":
        enqueue(db, f"course-delivery:{order.id}", "course_delivery", {"order_id": order.id})
    record(db, order.order_no, "paid", {"transaction_id": transaction_id})
    db.flush()
    return order


def release_closed(db, order):
    guard_claim(db)
    count = db.execute(update(Order).where(Order.id == order.id, Order.status.in_(["pending", "closing"]))
        .values(status="closed")).rowcount
    if not count:
        return
    if order.kind == "physical":
        for item in db.query(OrderItem).filter_by(order_id=order.id):
            changed = db.execute(update(Sku).where(Sku.id == item.entity_id, Sku.reserved >= item.quantity)
                .values(reserved=Sku.reserved - item.quantity)).rowcount
            if changed != 1:
                raise HTTPException(409, "预占库存异常，不能自动释放")
    record(db, order.order_no, "closed")


def order_dict(db, order):
    from .models import AfterSale, Shipment
    from .attachments import sale_dict
    payment = db.query(Payment).filter_by(order_id=order.id).first()
    return {**serialize(order, ("request_key", "request_hash", "payer_openid")),
        "refund_via_apple": bool(order.provider == "virtual" and payment and payment.params.get("platform") == "ios"),
        "items": [serialize(i) for i in db.query(OrderItem).filter_by(order_id=order.id)],
        "shipment": serialize(s) if (s := db.query(Shipment).filter_by(order_id=order.id).first()) else None,
        "aftersales": [sale_dict(a, db) for a in db.query(AfterSale).filter_by(order_id=order.id)], "legacy": False}
