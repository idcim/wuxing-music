from datetime import datetime
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Order as MusicOrder
from app.models import User
from app.routers.mp import get_current_user
from . import catalog, media, providers, schemas, trading
from .common import config, enabled, migrated, ok, ready, record, require_row, serialize, throttle
from .models import Address, AfterSale, CartItem, Category, Course, Enrollment, Lesson, Order, Payment, Product, Progress, Shipment, Sku

router = APIRouter(prefix="/api/mp/v2", tags=["commerce-v2"])
api = APIRouter(dependencies=[Depends(ready)])


def optional_user(authorization: str = Header(default=""), db: Session = Depends(get_db)):
    return get_current_user(authorization, db) if authorization else None


def owned_order(db, uid, ident):
    order = db.query(Order).filter_by(id=ident).populate_existing().with_for_update().first()
    if not order:
        raise HTTPException(404, "订单不存在")
    if order.user_id != uid:
        raise HTTPException(404, "订单不存在")
    return order


@router.get("/config")
def public_config(db: Session = Depends(get_db)):
    cfg = config(db)
    initialized = migrated(db)
    if not initialized:
        cfg.update(courses_visible=False, shop_visible=False, courses_sale=False, shop_sale=False)
    return ok({**cfg, "commerce_ready": initialized, "capabilities": providers.capabilities()})


@api.get("/catalog/{kind}")
def listing(kind: str, category: int | None = None, page: int = Query(1, ge=1),
            size: int = Query(20, ge=1, le=50), user=Depends(optional_user), db: Session = Depends(get_db)):
    if kind not in ("course", "physical"):
        raise HTTPException(404)
    enabled(db, kind)
    model, dump = (Course, catalog.course_dict) if kind == "course" else (Product, catalog.product_dict)
    all_live = db.query(model).filter_by(status="published")
    cats = [serialize(c) for c in db.query(Category).filter_by(kind=kind).order_by(Category.sort)
            if all_live.filter_by(category_id=c.id).first()]
    query = all_live.filter_by(category_id=category) if category else all_live
    rows = query.order_by(model.sort, model.id.desc()).offset((page - 1) * size).limit(size).all()
    return ok(dict(items=[dump(db, r, uid=user.id if user else None) if kind == "course" else dump(db, r) for r in rows],
                   total=query.count(), categories=cats))


@api.get("/courses/mine")
def my_courses(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ids = [i[0] for i in db.query(Enrollment.course_id).filter_by(user_id=user.id).distinct()]
    result = []
    for course in db.query(Course).filter(Course.id.in_(ids)).all():
        enrollments = db.query(Enrollment).filter_by(user_id=user.id, course_id=course.id).all()
        row = catalog.course_dict(db, course, user.id, detail=True)
        row["enrollments"] = [serialize(e) for e in enrollments]
        result.append(row)
    return ok(result)


@api.get("/courses/{ident}")
def course_detail(ident: int, user=Depends(optional_user), db: Session = Depends(get_db)):
    course = require_row(db, Course, ident)
    access = user and catalog.has_access(db, user.id, ident)
    if not access:
        enabled(db, "course")
        if course.status != "published":
            raise HTTPException(404, "课程未上架")
    return ok(catalog.course_dict(db, course, user.id if user else None, detail=True))


@api.post("/courses/{ident}/claim")
def claim(ident: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    enabled(db, "course")
    # 锁定用户行，避免双击领取、并发购买产生重复权益。
    db.query(User).filter_by(id=user.id).with_for_update().one()
    course = require_row(db, Course, ident)
    if course.status != "published" or course.price_fen:
        raise HTTPException(409, "课程不支持免费领取")
    trading.grant(db, user.id, ident, "free", course.access_days)
    db.commit()
    return ok(catalog.course_dict(db, course, user.id, detail=True))


@api.get("/lessons/{ident}/play")
def play(ident: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lesson, asset = catalog.playable(db, user.id, ident)
    progress = db.query(Progress).filter_by(user_id=user.id, lesson_id=ident).first()
    return ok(dict(url=media.signed_url(asset), expires_in=900, kind=asset.kind,
        duration=asset.duration, position=progress.position if progress else 0, title=lesson.title))


@api.post("/lessons/{ident}/progress")
def progress(ident: int, body: schemas.ProgressIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _, asset = catalog.playable(db, user.id, ident)
    db.query(User).filter_by(id=user.id).with_for_update().one()
    row = db.query(Progress).filter_by(user_id=user.id, lesson_id=ident).first()
    if not row:
        row = Progress(user_id=user.id, lesson_id=ident, furthest=0)
        db.add(row)
    position = min(body.position, asset.duration)
    row.position, row.furthest, row.updated_at = position, max(row.furthest, position), datetime.utcnow()
    row.completed = bool(row.completed or (asset.duration and row.furthest >= asset.duration * .95))
    db.commit()
    return ok(serialize(row))


@api.get("/products/{ident}")
def product_detail(ident: int, db: Session = Depends(get_db)):
    enabled(db, "physical")
    product = require_row(db, Product, ident)
    if product.status != "published":
        raise HTTPException(404, "商品未上架")
    return ok(catalog.product_dict(db, product, detail=True))


@api.get("/cart")
def cart(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = []
    for item in db.query(CartItem).filter_by(user_id=user.id).order_by(CartItem.id.desc()):
        sku = db.get(Sku, item.sku_id)
        product = db.get(Product, sku.product_id) if sku else None
        rows.append({**serialize(item), "sku": {**serialize(sku), "available": sku.stock - sku.reserved} if sku else None,
                     "product": serialize(product) if product else None})
    return ok(rows)


@api.post("/cart")
def cart_save(body: schemas.CartIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    enabled(db, "physical")
    db.query(User).filter_by(id=user.id).with_for_update().one()
    sku = require_row(db, Sku, body.sku_id)
    product = require_row(db, Product, sku.product_id)
    if not sku.enabled or product.status != "published" or body.quantity > sku.stock - sku.reserved:
        raise HTTPException(409, "规格不可用或库存不足")
    row = db.query(CartItem).filter_by(user_id=user.id, sku_id=sku.id).first()
    if not row:
        row = CartItem(user_id=user.id, sku_id=sku.id)
        db.add(row)
    row.quantity = body.quantity
    db.commit()
    return ok(serialize(row))


@api.delete("/cart/{ident}")
def cart_delete(ident: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(CartItem).filter_by(id=ident, user_id=user.id).delete()
    db.commit()
    return ok()


@api.get("/addresses")
def addresses(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok([serialize(a) for a in db.query(Address).filter_by(user_id=user.id).order_by(Address.id.desc())])


@api.post("/addresses")
def address_create(body: schemas.AddressIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = Address(user_id=user.id, **body.model_dump())
    db.add(row)
    db.commit()
    return ok(serialize(row))


@api.post("/addresses/{ident}")
def address_edit(ident: int, body: schemas.AddressIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = require_row(db, Address, ident)
    if row.user_id != user.id:
        raise HTTPException(404)
    for k, v in body.model_dump().items():
        setattr(row, k, v)
    db.commit()
    return ok(serialize(row))


@api.delete("/addresses/{ident}")
def address_delete(ident: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(Address).filter_by(id=ident, user_id=user.id).delete()
    db.commit()
    return ok()


@api.post("/checkout")
def checkout(body: schemas.CheckoutIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(trading.quote(db, user.id, body))


@api.post("/orders")
def create_order(body: schemas.OrderIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    throttle(user.id, "order")
    db.query(User).filter_by(id=user.id).with_for_update().one()
    return ok(trading.order_dict(db, trading.create_order(db, user.id, body)))


@api.get("/orders")
def orders(kind: str = "", state: str = "", page: int = Query(1, ge=1, le=1000), size: int = Query(20, ge=1, le=50),
           user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(Order).filter_by(user_id=user.id)
    if kind:
        query = query.filter_by(kind=kind)
    if state not in ("", "pending", "unshipped", "shipped", "aftersales"):
        raise HTTPException(422, "订单筛选状态不正确")
    if state == "pending":
        query = query.filter_by(status="pending")
    elif state in ("unshipped", "shipped"):
        query = query.filter_by(status="paid", fulfillment=state)
    elif state == "aftersales":
        query = query.filter(Order.id.in_(db.query(AfterSale.order_id).filter_by(user_id=user.id)))
    new = query.order_by(Order.created_at.desc()).limit(page * size).all() if kind != "music" else []
    legacy_q = db.query(MusicOrder).filter_by(user_id=user.id)
    legacy = legacy_q.order_by(MusicOrder.created_at.desc()).limit(page * size).all() if kind in ("", "music") and not state else []
    combined = [trading.order_dict(db, o) for o in new] + [dict(id=o.id, kind="music", order_no=o.order_no,
        amount_fen=round(o.amount * 100), status=o.status, legacy=True, gift_code=o.gift_code,
        created_at=o.created_at, items=[dict(title=o.plan_name, quantity=1, price_fen=round(o.amount * 100))]) for o in legacy]
    combined.sort(key=lambda x: x["created_at"], reverse=True)
    return ok(dict(items=combined[(page - 1) * size:page * size], total=(query.count() if kind != "music" else 0) + (legacy_q.count() if kind in ("", "music") and not state else 0)))


@api.get("/orders/{ident}")
def order_detail(ident: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(trading.order_dict(db, owned_order(db, user.id, ident)))


@api.post("/orders/{ident}/pay")
def pay(ident: int, body: schemas.PayIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    throttle(user.id, "pay", 10)
    order = owned_order(db, user.id, ident)
    enabled(db, order.kind, sale=True)
    if order.status != "pending" or order.expires_at <= datetime.utcnow():
        raise HTTPException(409, "订单已支付或过期")
    row = db.query(Payment).filter_by(order_id=order.id).with_for_update().one()
    providers.preflight(db, order, body.platform)
    if row.state == "initiating":
        raise HTTPException(409, "支付正在准备中，请稍后刷新订单")
    if row.state == "issued" and row.params:
        return ok({key: value for key, value in row.params.items() if key != "platform"})
    row.state = "initiating"
    db.commit()
    try:
        params = providers.create_payment(db, order, body.code, body.platform)
    except Exception as exc:
        row.error = str(exc)[:500]
        if isinstance(exc, HTTPException):
            row.state = "created"
        db.commit()
        raise
    db.execute(update(Payment).where(Payment.id == row.id, Payment.state == "initiating")
        .values(params={**params, "platform": body.platform}, state="issued", error=""))
    db.commit()
    return ok(params)


@api.post("/orders/{ident}/sync")
def sync_payment(ident: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    throttle(user.id, "payment-sync")
    order = owned_order(db, user.id, ident)
    if order.status in ("pending", "closing"):
        result = providers.query_payment(db, order)
        if result.get("paid"):
            trading.settle_paid(db, order.id, result["transaction_id"], result["amount_fen"])
            db.commit()
    return ok(trading.order_dict(db, order))


@api.post("/orders/{ident}/cancel")
def cancel(ident: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from .common import enqueue
    order = owned_order(db, user.id, ident)
    if order.status != "pending":
        raise HTTPException(409, "订单不可取消")
    row = db.query(Payment).filter_by(order_id=ident).one()
    if row.state == "created":
        trading.release_closed(db, order)
    else:
        order.status = "closing"
        enqueue(db, f"cancel:{ident}", "close", {"order_id": ident})
    db.commit()
    return ok(trading.order_dict(db, order))


@api.get("/orders/{ident}/logistics")
def logistics(ident: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from .logistics import trace
    throttle(user.id, "logistics", 30)
    order = owned_order(db, user.id, ident)
    shipment = db.query(Shipment).filter_by(order_id=ident).first()
    if not shipment:
        raise HTTPException(409, "尚未发货")
    identity = (shipment.carrier, shipment.tracking_no)
    result = trace(db, order, shipment)
    db.refresh(shipment)
    if identity != (shipment.carrier, shipment.tracking_no):
        raise HTTPException(409, "运单已更新，请刷新后重新查询")
    return ok({**serialize(shipment), "trace": result})


@api.post("/orders/{ident}/receive")
def receive(ident: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from .common import enqueue
    from .shipping import confirm_receipt
    order = owned_order(db, user.id, ident)
    if order.fulfillment == "received":
        return ok(trading.order_dict(db, order))
    if order.fulfillment != "shipped":
        raise HTTPException(409, "尚未发货或已收货")
    try:
        confirm_receipt(db, order)
    except RuntimeError as exc:
        enqueue(db, f"receipt:{ident}:{datetime.utcnow().strftime('%Y%m%d%H%M')}", "receipt", {"order_id": ident})
        db.commit()
        raise HTTPException(409, str(exc)) from exc
    return ok(trading.order_dict(db, order))


@api.post("/orders/{ident}/aftersales")
def aftersale(ident: int, body: schemas.AfterSaleIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    throttle(user.id, "aftersale", 10)
    from .aftersales import request_sale
    return ok(serialize(request_sale(db, user.id, owned_order(db, user.id, ident), body)))


@api.post("/aftersales/{ident}/return")
def return_parcel(ident: int, body: schemas.ReturnIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = require_row(db, AfterSale, ident)
    if row.user_id != user.id or row.state != "awaiting_return":
        raise HTTPException(409, "当前申请不可登记退货")
    row.return_carrier, row.return_tracking, row.state = body.carrier, body.tracking_no, "returning"
    db.commit()
    return ok(serialize(row))


@api.post("/aftersales/{ident}/authorize")
def authorize_refund(ident: int, body: schemas.PayIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from .models import Job
    throttle(user.id, "refund-authorize", 10)
    sale = require_row(db, AfterSale, ident)
    order = owned_order(db, user.id, sale.order_id)
    payment = db.query(Payment).filter_by(order_id=order.id).one()
    if sale.user_id != user.id or sale.state not in ("requested", "refunding") or order.provider != "virtual" or payment.params.get("platform") == "ios":
        raise HTTPException(409, "此申请不支持刷新微信退款授权")
    job = db.query(Job).filter_by(key=f"refund:{ident}").populate_existing().with_for_update().first()
    if job and job.state == "running":
        raise HTTPException(409, "退款正在处理中，请稍后再试")
    providers.refresh_refund_credential(db, order, body.code)
    if job and job.state == "failed":
        job.state, job.attempts, job.run_at = "pending", 0, datetime.utcnow()
    record(db, order.order_no, "refund_authorized", operator=str(user.id))
    db.commit()
    return ok()


router.include_router(api)
