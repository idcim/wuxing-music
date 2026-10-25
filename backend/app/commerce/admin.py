import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import ValidationError
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Setting
from app.security import require_perm
from . import catalog, media, providers, schemas, trading
from .common import config, enqueue, migrated, ok, ready, record, require_row, serialize
from .models import AfterSale, Category, Course, Event, InventoryLog, Job, Lesson, MediaAsset, Order, Payment, Product, Shipment, Sku, Teacher

router = APIRouter(prefix="/api/admin/commerce", tags=["commerce-admin"])
RESOURCES = {"categories": (Category, schemas.CategoryIn, "commerce:content"),
    "teachers": (Teacher, schemas.TeacherIn, "commerce:content"),
    "courses": (Course, schemas.CourseIn, "commerce:content"),
    "lessons": (Lesson, schemas.LessonIn, "commerce:content"),
    "products": (Product, schemas.ProductIn, "commerce:content"),
    "skus": (Sku, schemas.SkuIn, "commerce:inventory")}


@router.get("/status")
def status(_=Depends(require_perm("commerce:view")), db: Session = Depends(get_db)):
    from .monitor import snapshot
    initialized = migrated(db)
    return ok({"migrated": initialized, "capabilities": providers.capabilities(),
               "runtime": snapshot(db) if initialized else None})


api = APIRouter(dependencies=[Depends(ready)])


@api.get("/settings")
def settings(_=Depends(require_perm("commerce:view")), db: Session = Depends(get_db)):
    return ok({**config(db), "capabilities": providers.capabilities()})


@api.post("/settings")
def settings_save(body: schemas.ConfigIn, admin=Depends(require_perm("commerce:settings")), db: Session = Depends(get_db)):
    caps = providers.capabilities()
    if body.courses_sale and (not caps["course_payment"] or not caps["private_media"]):
        raise HTTPException(409, "收费课程的数字支付与私有媒体尚未配置验收")
    if body.shop_sale and (not caps["physical_payment"] or not caps["shipping"] or not body.provinces):
        raise HTTPException(409, "实物支付、发货能力或配送区域尚未配置验收")
    if body.shop_sale:
        providers.pay_cfg(db, require_enabled=True)
        if not body.physical_policy.strip() or not body.return_address.strip():
            raise HTTPException(409, "请先完善实物售后规则与退货地址")
    if body.courses_sale and not body.course_policy.strip():
        raise HTTPException(409, "请先完善课程购买与售后说明")
    row = db.query(Setting).filter_by(key="commerce_config").first()
    if not row:
        row = Setting(key="commerce_config")
        db.add(row)
    row.value = json.dumps(body.model_dump(), ensure_ascii=False)
    record(db, "settings", "updated", operator=admin.username)
    db.commit()
    return ok(config(db))


@api.get("/catalog/{resource}")
def list_catalog(resource: str, parent: int | None = None, page: int = Query(1, ge=1), size: int = Query(30, ge=1, le=100),
                 _=Depends(require_perm("commerce:view")), db: Session = Depends(get_db)):
    if resource not in RESOURCES:
        raise HTTPException(404)
    model = RESOURCES[resource][0]
    query = db.query(model)
    if parent and resource in ("lessons", "skus"):
        query = query.filter_by(**{"course_id" if resource == "lessons" else "product_id": parent})
    return ok(dict(items=[serialize(r) for r in query.order_by(model.id.desc()).offset((page - 1) * size).limit(size)], total=query.count()))


@api.post("/catalog/{resource}/{ident}")
def save_catalog(resource: str, ident: int, body: dict, admin=Depends(require_perm("commerce:content", "commerce:inventory")), db: Session = Depends(get_db)):
    from app.security import admin_permissions
    if resource not in RESOURCES:
        raise HTTPException(404)
    model, schema, permission = RESOURCES[resource]
    if not admin.is_super and permission not in admin_permissions(admin, db):
        raise HTTPException(403, "无此模块修改权限")
    try:
        data = schema.model_validate(body).model_dump()
    except ValidationError as exc:
        raise HTTPException(422, "字段格式或范围不正确") from exc
    row = require_row(db, model, ident) if ident else model(**data)
    if not ident:
        db.add(row)
    if resource in ("courses", "products") and data.get("category_id"):
        category = require_row(db, Category, data["category_id"])
        if category.kind != ("course" if resource == "courses" else "physical"):
            raise HTTPException(422, "分类类型不匹配")
    if resource == "categories" and ident and row.kind != data["kind"]:
        if db.query(Course).filter_by(category_id=ident).first() or db.query(Product).filter_by(category_id=ident).first():
            raise HTTPException(409, "被使用的分类不能修改业务类型")
    if resource == "courses" and data.get("teacher_id"):
        require_row(db, Teacher, data["teacher_id"])
    if resource == "courses" and data.get("payment_product") and db.query(Course).filter(
        Course.id != ident, Course.payment_product == data["payment_product"]).first():
        raise HTTPException(409, "该微信道具已绑定其他课程，请使用独立道具")
    if resource == "lessons":
        course = require_row(db, Course, data["course_id"])
        if course.status == "published":
            raise HTTPException(409, "请先下架课程再编辑章节")
        if ident and row.course_id != data["course_id"]:
            raise HTTPException(409, "章节不能移动到其他课程")
        if data.get("media_id"):
            require_row(db, MediaAsset, data["media_id"])
    if resource == "skus":
        require_row(db, Product, data["product_id"])
        if ident and row.product_id != data["product_id"]:
            raise HTTPException(409, "规格不能移动到其他商品")
    if resource == "courses" and ident and (row.price_fen != data["price_fen"] or row.payment_product != data["payment_product"]):
        row.revision += 1
        row.payment_synced_revision = 0
    for key, value in data.items():
        setattr(row, key, value)
    db.flush()
    if resource in ("courses", "products"):
        catalog.validate_publish(db, row)
    record(db, f"{resource}:{row.id}", "saved", operator=admin.username)
    db.commit()
    return ok(serialize(row))


@api.post("/courses/{ident}/verify-price")
def verify_price(ident: int, body: dict, admin=Depends(require_perm("commerce:payments")), db: Session = Depends(get_db)):
    course = require_row(db, Course, ident)
    if not providers.capabilities()["course_payment"] or not course.payment_product:
        raise HTTPException(409, "请先开通数字支付并绑定已发布的平台道具")
    if body.get("price_fen") != course.price_fen or body.get("revision") != course.revision or not body.get("evidence"):
        raise HTTPException(409, "请输入平台实际售价、当前版本与核验凭据")
    course.payment_synced_revision = course.revision
    record(db, f"courses:{ident}", "platform_price_verified", {"price_fen": course.price_fen,
        "revision": course.revision, "evidence": str(body["evidence"])[:512]}, admin.username)
    db.commit()
    return ok(serialize(course))


@api.post("/skus/{ident}/stock")
def stock(ident: int, body: schemas.StockIn, admin=Depends(require_perm("commerce:inventory")), db: Session = Depends(get_db)):
    count = db.execute(update(Sku).where(Sku.id == ident, Sku.stock + body.delta >= Sku.reserved)
        .values(stock=Sku.stock + body.delta)).rowcount
    if count != 1:
        raise HTTPException(409, "库存调整不能低于已预占数量")
    db.add(InventoryLog(sku_id=ident, delta=body.delta, reason=body.reason, operator=admin.username))
    db.commit()
    return ok(serialize(require_row(db, Sku, ident)))


@api.get("/media")
def media_list(_=Depends(require_perm("commerce:view")), db: Session = Depends(get_db)):
    return ok([serialize(m, ("source_key", "playback_key")) for m in db.query(MediaAsset).order_by(MediaAsset.id.desc()).limit(100)])


@api.post("/media/sign")
def media_sign(body: dict, _=Depends(require_perm("commerce:content")), db: Session = Depends(get_db)):
    name, kind = str(body.get("name", "")), body.get("kind", "video")
    if not 1 <= len(name) <= 255:
        raise HTTPException(422, "文件名不合法")
    return ok(media.upload_policy(db, name, kind))


@api.post("/media/{ident}/complete")
def media_complete(ident: int, _=Depends(require_perm("commerce:content")), db: Session = Depends(get_db)):
    asset = require_row(db, MediaAsset, ident)
    if asset.state == "uploading":
        metadata = media.bucket().head_object(asset.source_key)
        if not 0 < metadata.content_length <= media.MAX_SIZE:
            raise HTTPException(422, "上传文件大小无效")
        asset.state = "processing"
        enqueue(db, f"media:{ident}", "media", {"asset_id": ident})
        db.commit()
    return ok(serialize(asset, ("source_key", "playback_key")))


@api.get("/orders")
def order_list(kind: str = "", page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100),
               _=Depends(require_perm("commerce:view")), db: Session = Depends(get_db)):
    query = db.query(Order)
    if kind:
        query = query.filter_by(kind=kind)
    return ok(dict(items=[trading.order_dict(db, o) for o in query.order_by(Order.id.desc()).offset((page - 1) * size).limit(size)], total=query.count()))


@api.post("/orders/{ident}/ship")
def ship(ident: int, body: schemas.ReturnIn, admin=Depends(require_perm("commerce:ship")), db: Session = Depends(get_db)):
    order = db.query(Order).filter_by(id=ident).populate_existing().with_for_update().first()
    if not order or order.kind != "physical" or order.status != "paid" or order.fulfillment not in ("unshipped", "shipped"):
        raise HTTPException(409, "该订单不可发货")
    shipment = db.query(Shipment).filter_by(order_id=ident).populate_existing().with_for_update().first()
    if shipment:
        job = db.query(Job).filter_by(key=f"shipping:{shipment.id}").populate_existing().with_for_update().one()
        if shipment.sync_state != "failed" or job.state != "failed":
            raise HTTPException(409, "仅已失败且停止处理的发货同步可更正")
        shipment.carrier, shipment.tracking_no = body.carrier, body.tracking_no
        shipment.sync_state, shipment.error = "pending", ""
        job.state, job.attempts, job.run_at = "pending", 0, datetime.utcnow()
        record(db, order.order_no, "shipment_corrected", body.model_dump(), admin.username)
        db.commit()
        return ok(trading.order_dict(db, order))
    if db.query(AfterSale).filter(AfterSale.order_id == ident, AfterSale.state.notin_(["rejected", "refunded"])).first():
        raise HTTPException(409, "请先处理进行中的售后")
    if not providers.capabilities()["shipping"]:
        raise HTTPException(409, "微信发货能力尚未验收")
    shipment = Shipment(order_id=ident, carrier=body.carrier, tracking_no=body.tracking_no)
    db.add(shipment)
    db.flush()
    order.fulfillment = "shipped"
    enqueue(db, f"shipping:{shipment.id}", "shipping", {"shipment_id": shipment.id})
    record(db, order.order_no, "shipped", {"carrier": body.carrier, "tracking_no": body.tracking_no}, admin.username)
    db.commit()
    return ok(trading.order_dict(db, order))


@api.get("/aftersales")
def sales(_=Depends(require_perm("commerce:view")), page: int = Query(1, ge=1), db: Session = Depends(get_db)):
    from .attachments import sale_dict
    query = db.query(AfterSale)
    return ok(dict(items=[sale_dict(a) for a in query.order_by(AfterSale.id.desc()).offset((page - 1) * 30).limit(30)], total=query.count()))


@api.post("/aftersales/{ident}/review")
def review_sale(ident: int, body: schemas.ReviewIn, admin=Depends(require_perm("commerce:aftersales")), db: Session = Depends(get_db)):
    from .aftersales import review
    require_row(db, AfterSale, ident)
    sale = db.get(AfterSale, ident)
    from app.security import admin_permissions
    if body.restock and not admin.is_super and "commerce:inventory" not in admin_permissions(admin, db):
        raise HTTPException(403, "恢复可售库存需要库存管理权限")
    if body.action == "received" or (body.action == "approve" and sale.kind == "refund"):
        from app.security import admin_permissions
        if not admin.is_super and "commerce:payments" not in admin_permissions(admin, db):
            raise HTTPException(403, "此操作提交退款，需要退款权限")
    review(db, ident, body, admin.username)
    return ok(serialize(db.get(AfterSale, ident)))


@api.get("/jobs")
def jobs(_=Depends(require_perm("commerce:view")), db: Session = Depends(get_db)):
    return ok([serialize(j) for j in db.query(Job).order_by(Job.id.desc()).limit(100)])


@api.get("/events")
def events(_=Depends(require_perm("commerce:view")), db: Session = Depends(get_db)):
    return ok([serialize(e) for e in db.query(Event).order_by(Event.id.desc()).limit(100)])


@api.post("/jobs/{ident}/retry")
def retry_job(ident: int, admin=Depends(require_perm("commerce:payments", "commerce:content", "commerce:ship")), db: Session = Depends(get_db)):
    job = require_row(db, Job, ident)
    from app.security import admin_permissions
    permission = "commerce:content" if job.kind == "media" else "commerce:ship" if job.kind in ("shipping", "receipt") else "commerce:payments"
    if not admin.is_super and permission not in admin_permissions(admin, db):
        raise HTTPException(403, "无此类任务的重试权限")
    if job.state != "failed":
        raise HTTPException(409, "仅失败任务可手动重试")
    job.state, job.attempts, job.run_at = "pending", 0, datetime.utcnow()
    record(db, f"job:{ident}", "manual_retry", operator=admin.username)
    db.commit()
    return ok(serialize(job))


router.include_router(api)
