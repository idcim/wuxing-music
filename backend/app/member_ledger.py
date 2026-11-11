"""会员时长发放记录；退款撤销单笔权益后按原发放顺序重算。"""
import uuid
from datetime import datetime, timedelta

from app.models import MemberGrant, MemberLedger, User


def _current(db, user):
    return db.query(MemberLedger).filter_by(user_id=user.id).with_for_update().first()


def grant(db, user: User, *, kind: str, ref: str | int, days: int, plan_type: str,
          plan_name: str, source: str, at: datetime | None = None) -> None:
    """调用方负责锁定用户行与提交；同一业务来源只能记录一次。"""
    if days <= 0:
        raise ValueError("会员发放天数必须大于零")
    reference = str(ref)
    if db.query(MemberGrant.id).filter_by(source_kind=kind, source_ref=reference).first():
        raise ValueError("会员权益已发放")
    ledger = _current(db, user)
    if ledger is None:
        ledger = MemberLedger(user_id=user.id, baseline_type=user.membership_type,
            baseline_name=user.membership_name, baseline_source=user.membership_source,
            baseline_expire_at=user.membership_expire_at)
        db.add(ledger)
        db.flush()
    granted_at = at or datetime.utcnow()
    db.add(MemberGrant(ledger_id=ledger.id, source_kind=kind, source_ref=reference,
        duration_days=days, plan_type=plan_type, plan_name=plan_name, source=source,
        granted_at=granted_at))
    base = user.membership_expire_at if user.membership_expire_at and user.membership_expire_at > granted_at else granted_at
    user.membership_type = plan_type
    user.membership_name = plan_name
    user.membership_expire_at = base + timedelta(days=days)
    user.membership_source = source


def _project(db, user: User, ledger: MemberLedger) -> None:
    expiry = ledger.baseline_expire_at
    plan_type, plan_name, source = ledger.baseline_type, ledger.baseline_name, ledger.baseline_source
    rows = db.query(MemberGrant).filter_by(ledger_id=ledger.id, revoked_at=None).order_by(
        MemberGrant.granted_at, MemberGrant.id).all()
    for row in rows:
        base = expiry if expiry and expiry > row.granted_at else row.granted_at
        expiry = base + timedelta(days=row.duration_days)
        plan_type, plan_name, source = row.plan_type, row.plan_name, row.source
    if not expiry or expiry <= datetime.utcnow():
        user.membership_type, user.membership_name = "free", "听闻"
        user.membership_expire_at, user.membership_source = None, ""
    else:
        user.membership_type, user.membership_name = plan_type, plan_name
        user.membership_expire_at, user.membership_source = expiry, source


def revoke(db, user: User | None, *, kind: str, ref: str | int) -> bool:
    """True 表示记录已处理；归档链的退款不改当前权益。False 表示旧订单需兼容处理。"""
    row = db.query(MemberGrant).filter_by(source_kind=kind, source_ref=str(ref)).with_for_update().first()
    if row is None:
        return False
    if row.revoked_at is None:
        row.revoked_at = datetime.utcnow()
        ledger = db.get(MemberLedger, row.ledger_id)
        if user and ledger.user_id == user.id:
            _project(db, user, ledger)
    return True


def revoke_legacy_baseline(db, user: User | None, order) -> bool:
    """旧订单没有逐单流水时，仅回收首个新发放记录之前的旧权益。"""
    if not user:
        return False
    ledger = _current(db, user)
    if not ledger or ledger.baseline_source != "purchase":
        return False
    if order.provider != "virtual" and ledger.baseline_type != order.plan_id:
        return False
    if order.provider == "virtual" and order.duration_days > 0 and ledger.baseline_expire_at:
        ledger.baseline_expire_at -= timedelta(days=order.duration_days)
    else:
        ledger.baseline_expire_at = None
    if not ledger.baseline_expire_at or ledger.baseline_expire_at <= datetime.utcnow():
        ledger.baseline_type, ledger.baseline_name, ledger.baseline_source = "free", "听闻", ""
        ledger.baseline_expire_at = None
    _project(db, user, ledger)
    return True


def reset(db, user: User) -> None:
    """后台免费重置或注销：归档旧链，历史发放与退款仍可追溯。"""
    ledger = _current(db, user)
    if ledger:
        ledger.user_id = None


def merge(db, keep: User, drop: User, *, use_drop: bool) -> None:
    """沿用原账号合并的到期更晚规则，只保留获胜账号的发放链。"""
    keep_ledger = _current(db, keep)
    drop_ledger = _current(db, drop)
    losing = keep_ledger if use_drop else drop_ledger
    winning = drop_ledger if use_drop else keep_ledger
    if losing:
        losing.user_id = None
        db.flush()
    if winning and use_drop:
        winning.user_id = keep.id


def admin_grant(db, user: User, *, days: int, plan_type: str, plan_name: str) -> None:
    grant(db, user, kind="admin", ref=uuid.uuid4().hex, days=days,
        plan_type=plan_type, plan_name=plan_name, source="gift")
