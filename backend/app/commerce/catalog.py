from datetime import datetime
from fastapi import HTTPException
from sqlalchemy import or_

from .common import config, require_row, serialize
from .models import Course, Enrollment, Lesson, MediaAsset, Product, Progress, Sku, Teacher


def has_access(db, uid, course_id):
    return db.query(Enrollment).filter(Enrollment.user_id == uid, Enrollment.course_id == course_id,
        Enrollment.revoked.is_(False), or_(Enrollment.expires_at.is_(None), Enrollment.expires_at > datetime.utcnow())).first()


def course_dict(db, course, uid=None, detail=False):
    result = serialize(course, ("payment_product", "payment_synced_revision"))
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
    result["price_fen"] = min((s.price_fen for s in skus), default=0)
    if detail:
        result["skus"] = [{**serialize(s, ("reserved",)), "available": max(0, s.stock - s.reserved)} for s in skus]
        result["policy"] = config(db)["physical_policy"]
    return result


def validate_publish(db, row):
    if row.status != "published":
        return
    if not row.cover or not row.intro:
        raise HTTPException(409, "上架前请补齐封面和介绍")
    if isinstance(row, Course):
        if not row.teacher_id or not db.get(Teacher, row.teacher_id) or not row.instructions:
            raise HTTPException(409, "上架前请填写老师与学习说明")
        lessons = db.query(Lesson).filter_by(course_id=row.id).all()
        if not lessons or any(not x.media_id or not db.get(MediaAsset, x.media_id) or db.get(MediaAsset, x.media_id).state != "ready" or not db.get(MediaAsset, x.media_id).playback_key for x in lessons):
            raise HTTPException(409, "章节媒体尚未全部处理完成")
        if row.price_fen and (not row.payment_product or row.payment_synced_revision != row.revision):
            raise HTTPException(409, "课程价格版本尚未完成支付平台核验")
    else:
        if not db.query(Sku).filter_by(product_id=row.id, enabled=True).filter(Sku.price_fen > 0).first():
            raise HTTPException(409, "请先添加有效规格和售价")


def playable(db, uid, lesson_id):
    lesson = require_row(db, Lesson, lesson_id)
    course = require_row(db, Course, lesson.course_id)
    access = has_access(db, uid, course.id)
    if not access and not (lesson.preview and course.status == "published"):
        raise HTTPException(403, "请先领取或购买课程；音乐会员不包含课程")
    media = require_row(db, MediaAsset, lesson.media_id) if lesson.media_id else None
    if not media or media.state != "ready":
        raise HTTPException(409, "课程媒体尚未就绪")
    return lesson, media
