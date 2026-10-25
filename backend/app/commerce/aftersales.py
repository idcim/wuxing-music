import uuid
from fastapi import HTTPException
from sqlalchemy import update

from app import wxpay
from app.models import User
from .common import RetryLater, enqueue, guard_claim, record
from .models import AfterSale, Enrollment, InventoryLog, Order, OrderItem, Sku
from .providers import pay_cfg, virtual_request
from .attachments import normalize


def request_sale(db, uid, order, body):
    from .models import Payment
    payment = db.query(Payment).filter_by(order_id=order.id).first()
    if order.provider == "virtual" and payment and payment.params.get("platform") == "ios":
        raise HTTPException(409, "Apple 渠道课程请在 App Store 购买记录中申请退款")
    if order.provider == "virtual":
        from .providers import refresh_refund_credential
        refresh_refund_credential(db, order, body.code)
    order = db.query(Order).filter_by(id=order.id).populate_existing().with_for_update().one()
    if order.user_id != uid or order.status != "paid":
        raise HTTPException(409, "当前订单不可申请售后")
    item = db.query(OrderItem).filter_by(id=body.item_id, order_id=order.id).populate_existing().with_for_update().first()
    if not item or item.quantity - item.refund_quantity < body.quantity:
        raise HTTPException(409, "可售后数量不足或已有处理中申请")
    if body.kind == "return_refund" and (order.kind != "physical" or order.fulfillment == "unshipped"):
        raise HTTPException(409, "未发货订单请选择退款")
    changed = db.execute(update(OrderItem).where(OrderItem.id == item.id,
        OrderItem.refund_quantity + body.quantity <= OrderItem.quantity)
        .values(refund_quantity=OrderItem.refund_quantity + body.quantity)).rowcount
    if changed != 1:
        raise HTTPException(409, "售后数量发生变化")
    amount = item.price_fen * body.quantity
    sale = AfterSale(order_id=order.id, item_id=item.id, user_id=uid, kind=body.kind,
        quantity=body.quantity, amount_fen=amount, reason=body.reason, images=normalize(db, uid, body.images),
        refund_no="R" + uuid.uuid4().hex[:30])
    db.add(sale)
    record(db, order.order_no, "aftersale_requested", {"item_id": item.id, "quantity": body.quantity}, str(uid))
    db.commit()
    return sale


def review(db, sale_id, body, operator):
    sale = db.query(AfterSale).filter_by(id=sale_id).populate_existing().with_for_update().one()
    order = db.query(Order).filter_by(id=sale.order_id).populate_existing().with_for_update().one()
    if body.action == "reject":
        if sale.state != "requested":
            raise HTTPException(409, "仅待审核申请可拒绝")
        sale.state, sale.remark = "rejected", body.remark
        db.execute(update(OrderItem).where(OrderItem.id == sale.item_id)
            .values(refund_quantity=OrderItem.refund_quantity - sale.quantity))
    elif body.action == "approve":
        if sale.state != "requested":
            raise HTTPException(409, "该申请已处理")
        sale.state = "awaiting_return" if sale.kind == "return_refund" else "refunding"
        if sale.state == "refunding":
            enqueue(db, f"refund:{sale.id}", "refund", {"sale_id": sale.id})
    else:
        if sale.state != "returning" or not sale.return_tracking:
            raise HTTPException(409, "请确认退货已寄回并验收")
        sale.state = "refunding"
        if body.restock and not sale.restocked and order.kind == "physical":
            item = db.get(OrderItem, sale.item_id)
            db.execute(update(Sku).where(Sku.id == item.entity_id).values(stock=Sku.stock + sale.quantity))
            db.add(InventoryLog(sku_id=item.entity_id, delta=sale.quantity, reason="退货验收 " + sale.refund_no, operator=operator))
            sale.restocked = True
        enqueue(db, f"refund:{sale.id}", "refund", {"sale_id": sale.id})
    record(db, order.order_no, "aftersale_" + body.action, {"sale_id": sale.id, "remark": body.remark}, operator)
    db.commit()


def finalize(db, sale_id):
    guard_claim(db)
    sale = db.query(AfterSale).filter_by(id=sale_id).populate_existing().with_for_update().one()
    if sale.state == "refunded":
        return
    if sale.state != "refunding":
        raise HTTPException(409, "退款状态不匹配")
    order = db.query(Order).filter_by(id=sale.order_id).populate_existing().with_for_update().one()
    if order.refund_fen + sale.amount_fen > order.amount_fen:
        raise HTTPException(409, "累计退款金额超过实付")
    sale.state = "refunded"
    order.refund_fen += sale.amount_fen
    if order.refund_fen == order.amount_fen:
        order.status = "refunded"
    if order.kind == "course":
        db.query(Enrollment).filter_by(user_id=order.user_id, source=order.order_no).update({"revoked": True})
    if order.fulfillment == "unshipped" and order.kind == "physical" and not sale.restocked:
        item = db.get(OrderItem, sale.item_id)
        db.execute(update(Sku).where(Sku.id == item.entity_id).values(stock=Sku.stock + sale.quantity))
        db.add(InventoryLog(sku_id=item.entity_id, delta=sale.quantity, reason="未发货退款 " + sale.refund_no))
        sale.restocked = True
    record(db, order.order_no, "refunded", {"sale_id": sale.id, "amount_fen": sale.amount_fen})
    # 多商品全部退完后，运费独立退款，避免并行申请时漏退或重复退。
    goods_total = order.amount_fen - order.shipping_fen
    if order.kind == "physical" and order.fulfillment == "unshipped" and order.shipping_fen > 0 and order.refund_fen == goods_total:
        freight_no = "RS" + order.order_no[1:]
        if not db.query(AfterSale).filter_by(refund_no=freight_no).first():
            freight = AfterSale(order_id=order.id, item_id=sale.item_id, user_id=order.user_id,
                kind="shipping_refund", quantity=0, amount_fen=order.shipping_fen, reason="未发货商品全部退款，退还运费",
                images=[], state="refunding", refund_no=freight_no)
            db.add(freight)
            db.flush()
            enqueue(db, f"refund:{freight.id}", "refund", {"sale_id": freight.id})
    db.flush()


def validate_native_refund(order, sale, data, *, require_currency=True):
    amount = data.get("amount") if isinstance(data, dict) else None
    if (not isinstance(amount, dict) or data.get("out_refund_no") != sale.refund_no
            or data.get("out_trade_no") != order.order_no or data.get("transaction_id") != order.transaction_id
            or type(amount.get("refund")) is not int or amount.get("refund") != sale.amount_fen
            or type(amount.get("total")) is not int or amount.get("total") != order.amount_fen
            or ((require_currency or "currency" in amount) and amount.get("currency") != "CNY")):
        raise HTTPException(409, "退款订单、金额或币种不匹配")


def run_refund(db, sale_id):
    sale = db.get(AfterSale, sale_id)
    if not sale or sale.state == "refunded":
        return
    if sale.state != "refunding":
        raise RuntimeError("售后尚未获准退款")
    order = db.get(Order, sale.order_id)
    if order.provider == "virtual":
        from .models import Payment
        if db.query(Payment).filter_by(order_id=order.id).one().params.get("platform") == "ios":
            raise RuntimeError("iOS 课程请由用户在 App Store 申请退款，等待渠道结果")
        # 渠道不允许商户主动退款时返回明确错误，保留退款任务供人工处理。
        user = db.get(User, order.user_id)
        from .providers import refund_session_key, query_payment
        if query_payment(db, order).get("refunded"):
            finalize(db, sale.id)
            db.commit()
            return
        result = virtual_request(db, "/xpay/refund_order", dict(openid=order.payer_openid, env=0,
            order_id=order.order_no, refund_order_id=sale.refund_no, refund_fee=sale.amount_fen,
            left_fee=order.amount_fen - order.refund_fen, refund_reason="3", req_from="2", biz_meta=sale.reason),
            session_key=refund_session_key(db, order))
        from .providers import query_payment
        if query_payment(db, order).get("refunded"):
            finalize(db, sale.id)
        else:
            raise RetryLater("数字支付退款已受理，等待渠道确认")
    else:
        cfg = pay_cfg(db)
        try:
            result = wxpay.query_refund(cfg, out_refund_no=sale.refund_no)
        except wxpay.RefundNotFound:
            result = wxpay.refund(cfg, transaction_id=order.transaction_id, out_refund_no=sale.refund_no,
                refund_fen=sale.amount_fen, total_fen=order.amount_fen, reason=sale.reason,
                notify_url=cfg["notify_url"].replace("/wxpay", "/refund"))
        validate_native_refund(order, sale, result)
        if result.get("status") == "SUCCESS":
            finalize(db, sale.id)
        elif result.get("status") == "PROCESSING":
            raise RetryLater("退款已受理，等待渠道确认")
        else:
            raise RuntimeError(f"退款状态 {result.get('status', 'UNKNOWN')}，需在商户平台核对")
    db.commit()


def channel_course_refund(db, order):
    """仅在已验证的渠道全额退款查单后调用；保留独立来源权益。"""
    order = db.query(Order).filter_by(id=order.id).populate_existing().with_for_update().one()
    if order.kind != "course" or order.status not in ("paid", "refunded"):
        raise HTTPException(409, "渠道退款的原支付尚需核对")
    existing = db.query(AfterSale).filter_by(refund_no="RC" + order.order_no[1:]).first()
    if existing:
        return existing
    item = db.query(OrderItem).filter_by(order_id=order.id).one()
    for pending in db.query(AfterSale).filter_by(order_id=order.id, state="requested"):
        pending.state, pending.remark = "rejected", "已由渠道确认全额退款"
    item.refund_quantity = item.quantity
    sale = AfterSale(order_id=order.id, item_id=item.id, user_id=order.user_id, kind="refund",
        quantity=item.quantity, amount_fen=order.amount_fen - order.refund_fen, reason="支付渠道确认退款",
        images=[], state="refunding", refund_no="RC" + order.order_no[1:])
    db.add(sale)
    db.flush()
    return sale
