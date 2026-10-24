"""用户注销与测试账号清理。

真实账号只软删除并匿名化：订单、分成和合并审计仍需可追溯。
早期测试号只有在完全没有业务引用时才允许物理删除。
"""

import logging
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import (
    Agent,
    Cdkey,
    CdkeyRedeemLog,
    Commission,
    Order,
    PlayHistory,
    User,
    UserMergeLog,
)

logger = logging.getLogger("uvicorn.error")


def is_deleted(user: User | None) -> bool:
    return bool(user and user.deleted_at)


def deactivate_user(db: Session, user: User) -> None:
    """注销账号：匿名化身份字段，保留财务与审计记录。"""
    if user.deleted_at:
        return

    db.query(PlayHistory).filter(PlayHistory.user_id == user.id).delete(synchronize_session=False)
    db.query(CdkeyRedeemLog).filter(CdkeyRedeemLog.user_id == user.id).update(
        {"ip": "", "device": ""}, synchronize_session=False
    )

    agent = db.query(Agent).filter(Agent.user_id == user.id).first()
    if agent and agent.status == "active":
        agent.status = "disabled"

    # 并入本账号的墓碑行必须连坐释放 openid：墓碑刻意保留原 openid 供旧端登录解析，
    # 但注销后本人重新注册会 INSERT 同一个 openid，撞上唯一键（线上实测 1062）。
    # 注销意味着账号体系里此人已不存在，旧端解析没有保留意义。
    for tomb in db.query(User).filter(User.merged_into == user.id).all():
        if not tomb.openid.startswith("deleted:"):
            tomb.openid = f"deleted:{tomb.id}:{uuid.uuid4().hex[:8]}"

    user.deleted_at = datetime.utcnow()
    user.openid = f"deleted:{user.id}:{uuid.uuid4().hex[:8]}"
    user.unionid = ""
    user.oa_openid = ""
    user.web_openid = ""
    user.phone = ""
    user.password_hash = ""
    user.nickname = "已注销用户"
    user.avatar = ""
    user.birthday = None
    user.birth_hour = None
    user.element = ""
    user.element_scores = "{}"
    user.quiz_completed_at = None
    user.membership_type = "free"
    user.membership_name = "听闻"
    user.membership_expire_at = None
    user.membership_source = ""
    db.commit()


def hard_delete_blockers(db: Session, user: User) -> list[str]:
    """列出禁止物理删除的原因；空列表才允许真正删行。"""
    checks = [
        (db.query(Order).filter(Order.user_id == user.id).first(), "有订单记录"),
        (db.query(Cdkey).filter(Cdkey.used_by == user.id).first(), "有兑换码使用记录"),
        (db.query(CdkeyRedeemLog).filter(CdkeyRedeemLog.user_id == user.id).first(), "有兑换日志"),
        (db.query(Commission).filter(Commission.user_id == user.id).first(), "有分成记录"),
        (db.query(Agent).filter(Agent.user_id == user.id).first(), "关联代理"),
        (db.query(User).filter(User.merged_into == user.id).first(), "有其他账号合并到该用户"),
        (
            db.query(UserMergeLog)
            .filter((UserMergeLog.keep_user_id == user.id) | (UserMergeLog.drop_user_id == user.id))
            .first(),
            "有账号合并审计记录",
        ),
    ]
    return [label for row, label in checks if row]


def delete_user_record(db: Session, user: User, operator: str = "") -> str:
    """优先清理无引用的测试号；有业务引用则软删除。返回 deleted / deactivated。"""
    blockers = hard_delete_blockers(db, user)
    if blockers:
        deactivate_user(db, user)
        logger.info("注销用户：admin=%s user=%s blockers=%s", operator or "-", user.id, ",".join(blockers))
        return "deactivated"

    db.query(PlayHistory).filter(PlayHistory.user_id == user.id).delete(synchronize_session=False)
    db.delete(user)
    db.commit()
    logger.info("物理删除测试用户：admin=%s user=%s", operator or "-", user.id)
    return "deleted"


def test_user_candidates(db: Session) -> list[User]:
    """早期测试账号候选：无开放平台/手机号身份、无权益、默认昵称、无任何业务引用。"""
    rows = (
        db.query(User)
        .filter(
            User.merged_into.is_(None),
            User.deleted_at.is_(None),
            User.unionid == "",
            User.oa_openid == "",
            User.web_openid == "",
            User.phone == "",
            User.membership_type == "free",
            User.nickname.like("律音用户%"),
            User.element == "",
            User.quiz_completed_at.is_(None),
            User.birthday.is_(None),
            User.birth_hour.is_(None),
            User.avatar == "",
            User.agent_id.is_(None),
        )
        .order_by(User.id)
        .all()
    )
    return [user for user in rows if not hard_delete_blockers(db, user)]


def cleanup_test_users(db: Session, confirm: bool, operator: str = "") -> dict:
    """先预检，确认后才删除。批量清理只允许物理删除路径，绝不软删真实业务账号。"""
    candidates = test_user_candidates(db)
    sample = [{"id": u.id, "nickname": u.nickname, "created_at": u.created_at.isoformat()} for u in candidates[:10]]
    if not confirm:
        return {"candidates": len(candidates), "sample": sample, "deleted": 0}

    deleted = 0
    for user in candidates:
        if delete_user_record(db, user, operator=operator) == "deleted":
            deleted += 1
    logger.info("批量清理测试用户：admin=%s deleted=%s", operator or "-", deleted)
    return {"candidates": len(candidates), "sample": sample, "deleted": deleted}
