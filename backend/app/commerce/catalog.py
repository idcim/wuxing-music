from datetime import datetime
from fastapi import HTTPException
from sqlalchemy import or_

from .common import config, enabled, require_row, serialize
from .models import Course, Enrollment, Lesson, MediaAsset, Product, Progress, Sku, Teacher


def has_access(db, uid, course_id):
    return db.query(Enrollment).filter(Enrollment.user_id == uid, Enrollment.course_id == course_id,
        Enrollment.revoked.is_(False), or_(Enrollment.expires_at.is_(None), Enrollment.expires_at > datetime.utcnow())).first()


def course_dict(db, course, uid=None, detail=False):
    result = serialize(course, ("payment_product", "payment_synced_revision"))
    result["purchase_ready"] = not course.price_fen or not sale_issues(course)
    lessons = db.query(Lesson).filter_by(course_id=course.id).order_by(Lesson.sort, Lesson.id).all()
    result.update(lesson_count=len(lessons), owned=bool(uid and has_access(db, uid, course.id)))
    if detail:
        rights = db.query(Enrollment).filter_by(user_id=uid, course_id=course.id, revoked=False).all() if uid else []
        valid = [r for r in rights if r.expires_at is None or r.expires_at > datetime.utcnow()]
        result["valid_until"] = None if any(r.expires_at is None for r in valid) else max((r.expires_at for r in valid), default=None)
        result["teacher"] = serialize(db.get(Teacher, course.teacher_id)) if course.teacher_id and db.get(Teacher, course.teacher_id) else None
        result["lessons"] = []
        for lesson in lessons:
            media = db.get(MediaAsset, lesson.media_id) if lesson.media_id else None
            progress = db.query(Progress).filter_by(user_id=uid, lesson_id=lesson.id).first() if uid else None
            result["lessons"].append({**serialize(lesson, ("media_id",)), "kind": media.kind if media else "video",
                "duration": media.duration if media else 0, "ready": bool(media and media.state == "ready"),
                "progress": serialize(progress) if progress else None})
        result["policy"] = config(db)["course_policy"]
    return result


def product_dict(db, product, detail=False):
    result = serialize(product)
    skus = db.query(Sku).filter_by(product_id=product.id, enabled=True).order_by(Sku.id).all()
    priced = [s for s in skus if s.price_fen > 0]
    available = [s for s in priced if s.stock > s.reserved]
    result["price_fen"] = min((s.price_fen for s in available or priced), default=0)
    result["in_stock"] = bool(available)
    if detail:
        result["skus"] = [{**serialize(s, ("reserved",)), "available": max(0, s.stock - s.reserved)} for s in skus]
        result["policy"] = config(db)["physical_policy"]
    return result


def publish_issues(db, row):
    """内容上架缺项；后台列表与保存校验共用，避免提示和实际门槛分叉。"""
    issues = []
    if not row.cover.strip():
        issues.append("封面")
    if not row.intro.strip():
        issues.append("介绍")
    if isinstance(row, Course):
        teacher = db.get(Teacher, row.teacher_id) if row.teacher_id else None
        if not teacher:
            issues.append("授课老师")
        elif not teacher.intro.strip():
            issues.append("老师介绍")
        if not row.instructions.strip():
            issues.append("学习说明")
        lessons = db.query(Lesson).filter_by(course_id=row.id).all()
        media_ids = {lesson.media_id for lesson in lessons if lesson.media_id}
        media = {item.id: item for item in db.query(MediaAsset).filter(MediaAsset.id.in_(media_ids)).all()} if media_ids else {}
        if not lessons or any(not lesson.media_id or not media.get(lesson.media_id)
                              or media[lesson.media_id].state != "ready" or not media[lesson.media_id].playback_key
                              for lesson in lessons):
            issues.append("已就绪章节课件")
    else:
        if not db.query(Sku).filter_by(product_id=row.id, enabled=True).filter(Sku.price_fen > 0).first():
            issues.append("有效规格和售价")
    return issues


def sale_issues(course):
    if not course.price_fen:
        return []
    issues = []
    if not course.payment_product:
        issues.append("微信课程商品编号")
    if course.payment_synced_revision != course.revision:
        issues.append("支付平台价格核验")
    return issues


def validate_publish(db, row):
    if row.status != "published":
        return
    issues = publish_issues(db, row)
    if issues:
        raise HTTPException(409, "上架前请补齐：" + "、".join(issues))


def playable(db, uid, lesson_id):
    lesson = require_row(db, Lesson, lesson_id)
    course = require_row(db, Course, lesson.course_id)
    access = uid and has_access(db, uid, course.id)
    if not access:
        enabled(db, "course")
        if not (lesson.preview and course.status == "published"):
            raise HTTPException(403, "请先领取或购买课程；音乐会员不包含课程")
    media = require_row(db, MediaAsset, lesson.media_id) if lesson.media_id else None
    if not media or media.state != "ready":
        raise HTTPException(409, "课程媒体尚未就绪")
    return lesson, media
