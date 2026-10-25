"""统一账号的归属迁移与删除约束，保持新旧业务一致。"""
import uuid
from .common import migrated
from .models import Address, AfterSale, Attachment, CartItem, Enrollment, Order, Progress


def blockers(db, uid):
    if not migrated(db):
        return []
    return ["有课程/商城业务引用"] if any(db.query(m).filter_by(user_id=uid).first()
        for m in (Order, Enrollment, Progress, AfterSale, Address, CartItem, Attachment)) else []


def erase_profile(db, uid):
    if migrated(db):
        db.query(Address).filter_by(user_id=uid).delete()
        db.query(CartItem).filter_by(user_id=uid).delete()


def merge(db, keep, drop):
    if not migrated(db):
        return
    for order in db.query(Order).filter_by(user_id=drop).all():
        if db.query(Order).filter_by(user_id=keep, request_key=order.request_key).first():
            order.request_key = f"merged_{order.id}_{uuid.uuid4().hex}"
        order.user_id = keep
    db.flush()
    for model in (AfterSale, Address, Attachment):
        db.query(model).filter_by(user_id=drop).update({"user_id": keep}, synchronize_session=False)
    for source in db.query(Enrollment).filter_by(user_id=drop).all():
        target = db.query(Enrollment).filter_by(user_id=keep, course_id=source.course_id, source=source.source).first()
        if target:
            if target.revoked and not source.revoked:
                target.expires_at = source.expires_at
            elif not target.revoked and not source.revoked:
                target.expires_at = None if target.expires_at is None or source.expires_at is None else max(target.expires_at, source.expires_at)
            target.revoked = target.revoked and source.revoked
            db.delete(source)
        else:
            source.user_id = keep
    for source in db.query(Progress).filter_by(user_id=drop).all():
        target = db.query(Progress).filter_by(user_id=keep, lesson_id=source.lesson_id).first()
        if target:
            target.furthest, target.completed = max(target.furthest, source.furthest), target.completed or source.completed
            if source.updated_at > target.updated_at:
                target.position, target.updated_at = source.position, source.updated_at
            db.delete(source)
        else:
            source.user_id = keep
    for source in db.query(CartItem).filter_by(user_id=drop).all():
        target = db.query(CartItem).filter_by(user_id=keep, sku_id=source.sku_id).first()
        if target:
            target.quantity = min(99, target.quantity + source.quantity)
            db.delete(source)
        else:
            source.user_id = keep
    db.flush()
