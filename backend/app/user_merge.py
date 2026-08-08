"""账号合并：接入微信开放平台后，把同一个人散在两端的账号并成一条。

**为什么需要它**：小程序与公众号是两个 appid，各自的 openid 互不相通，
在没绑定开放平台之前，同一个人在两端登录会各建一条 `user` 行。绑定之后微信
开始下发 unionid，登录时 `unionid > openid` 的匹配顺序会把他认到**其中一条**上——
另一条上的会员、订单、聆听历史就此搁浅，用户看到的是「我的会员没了」。
所以合并逻辑必须**先于绑定上线**，否则伤到的是真实付费用户。

**为什么按 unionid 自动合并是安全的**：两个标识来自同一次微信授权
（`jscode2session` / `oauth2/access_token` 同时返回 openid 与 unionid），
它们可证地属于同一个人。按手机号合并则不然（家人共用号码），只走后台人工。

**行不删除**：被合并的一方留在库里并打上 `merged_into` 指针，登录与鉴权时跟着
指针走。删行会让历史订单指向一个不存在的 user_id，出了争议无从追溯。
"""

import json
import logging
from datetime import datetime

from sqlalchemy import func
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

# 跟随 merged_into 指针的上限。正常链长为 1，设个上限纯粹是防数据异常成环时死循环。
_MAX_HOPS = 10


def resolve_user(db: Session, user: User | None) -> User | None:
    """跟随 merged_into 指针找到存活的那条行。

    登录与鉴权都要过一遍：老 token 里的 user_id 可能指着已被合并的行。
    """
    hops = 0
    while user is not None and user.merged_into and hops < _MAX_HOPS:
        nxt = db.query(User).filter(User.id == user.merged_into).first()
        if nxt is None or nxt.id == user.id:
            break
        user = nxt
        hops += 1
    if hops >= _MAX_HOPS:
        logger.warning("merged_into 链过长或成环，停在 user_id=%s", user.id if user else None)
    return user


def _expire_ts(u: User) -> float:
    """会员到期时间的可比值；未开通按 0（早于任何真实到期时间）。"""
    return u.membership_expire_at.timestamp() if u.membership_expire_at else 0.0


def pick_keeper(a: User, b: User) -> tuple[User, User]:
    """决定保留哪条。返回 (keep, drop)。

    规则：**会员期更晚的优先保留**——把权益留在原地，搬动越少越不容易出错；
    会员期相同（含都没开通）时保留 id 更小的，也就是更早注册的那条。
    """
    ea, eb = _expire_ts(a), _expire_ts(b)
    if ea != eb:
        return (a, b) if ea > eb else (b, a)
    return (a, b) if a.id <= b.id else (b, a)


# 合并时要改指向的表：(模型, 外键列名)
_OWNED = [
    (Order, "user_id"),
    (PlayHistory, "user_id"),
    (CdkeyRedeemLog, "user_id"),
    (Commission, "user_id"),   # 分成记录上的下单人
    (Cdkey, "used_by"),        # 兑换码的使用者
    (Agent, "user_id"),        # 代理关联的用户（drop 若本身是代理，改指向 keep）
]

# keep 为空时才从 drop 搬过来的标量字段。刻意不含 openid：
# 它有唯一约束，两条行各有各的值，搬过去必然撞键；unionid / oa_openid 才是要补的。
_FILL_IF_EMPTY = [
    "unionid", "oa_openid", "phone", "password_hash",
    "birthday", "birth_hour", "element", "element_scores", "quiz_completed_at",
    "agent_id", "agent_bound_at", "avatar",
]


def merge_users(
    db: Session,
    keep: User,
    drop: User,
    reason: str = "unionid",
    operator: str = "",
) -> dict:
    """把 drop 并入 keep。调用方负责 commit。

    幂等：drop 已经被合并过（merged_into 非空）时直接返回，不重复搬运。
    """
    if keep.id == drop.id:
        return {"skipped": "same-user"}
    if drop.merged_into:
        return {"skipped": "already-merged"}

    detail: dict = {"moved": {}, "filled": [], "membership": "keep"}

    # 1) 归属数据改指向
    for model, col in _OWNED:
        n = (
            db.query(model)
            .filter(getattr(model, col) == drop.id)
            .update({col: keep.id}, synchronize_session=False)
        )
        if n:
            detail["moved"][f"{model.__tablename__}.{col}"] = n

    # 2) keep 缺什么就从 drop 补什么（不覆盖 keep 已有的值）
    for f in _FILL_IF_EMPTY:
        if not hasattr(keep, f):
            continue
        if not getattr(keep, f, None) and getattr(drop, f, None):
            setattr(keep, f, getattr(drop, f))
            detail["filled"].append(f)

    # 3) 会员取到期更晚的一整组（type/name/expire/source 必须同进同退，
    #    否则会出现「年藏」的名字配着月卡的到期日这种自相矛盾的展示）
    if _expire_ts(drop) > _expire_ts(keep):
        keep.membership_type = drop.membership_type
        keep.membership_name = drop.membership_name
        keep.membership_expire_at = drop.membership_expire_at
        keep.membership_source = drop.membership_source
        detail["membership"] = "drop"

    # 4) 立碑：清掉 drop 的 unionid / oa_openid，避免它再被任何匹配路径命中；
    #    openid 保留（唯一约束占着，也便于追溯这条行原本是谁）
    drop.unionid = ""
    drop.oa_openid = ""
    drop.merged_into = keep.id

    db.add(UserMergeLog(
        keep_user_id=keep.id,
        drop_user_id=drop.id,
        reason=reason,
        operator=operator,
        detail=json.dumps(detail, ensure_ascii=False, default=str),
    ))
    logger.info("账号合并：%s ← %s（%s）%s", keep.id, drop.id, reason, detail)
    return detail


def resolve_login(
    db: Session,
    unionid: str,
    openid: str = "",
    oa_openid: str = "",
) -> User | None:
    """按一次微信授权拿到的标识解析用户，顺带把撞上的重复账号并掉。

    匹配顺序仍是 unionid > openid / oa_openid。区别在于：**两边都命中且不是同一行时
    就地合并**——这正是绑定开放平台后老用户第一次跨端登录的那一刻，
    也是唯一能把两条行认成一个人的时机。错过它，另一条行就永远搁浅了。
    """
    by_union = None
    if unionid:
        by_union = db.query(User).filter(User.unionid == unionid).first()
        by_union = resolve_user(db, by_union)

    by_open = None
    if openid:
        by_open = db.query(User).filter(User.openid == openid).first()
    if by_open is None and oa_openid:
        by_open = db.query(User).filter(User.oa_openid == oa_openid).first()
    by_open = resolve_user(db, by_open)

    merged = False
    if by_union and by_open and by_union.id != by_open.id:
        keep, drop = pick_keeper(by_union, by_open)
        merge_users(db, keep, drop, reason="unionid")
        user = keep
        merged = True
    else:
        user = by_union or by_open

    if user is None:
        return None

    # 把本次授权带来的标识回填到存活行——**必须在这里做，不能交给调用方**。
    # 合并的触发条件是「unionid 命中一行、openid 命中另一行」，而 unionid 是靠
    # 上一次登录回填上去的；哪条登录路径漏了回填，跨端合并就永远不会发生。
    changed = False
    if unionid and not user.unionid:
        user.unionid = unionid
        changed = True
    if oa_openid and not user.oa_openid:
        user.oa_openid = oa_openid
        changed = True

    if merged or changed:
        db.commit()
        db.refresh(user)
    return user


def find_duplicates(db: Session) -> list[dict]:
    """疑似重复账号，供后台排查。

    两类来源：
    - `unionid`：同一 unionid 多行。理论上登录时就该被自动合并掉，还剩说明有异常，优先看。
    - `phone`：同一手机号多行。**这类不自动合并**——家人共用号码是真实存在的，
      并错了不可逆，交给人工判断。绑定开放平台之前产生的孤儿账号主要靠这条找回。
    """
    groups: list[dict] = []
    alive = User.merged_into.is_(None)

    for field, label in (("unionid", "unionid"), ("phone", "phone")):
        col = getattr(User, field)
        dup = (
            db.query(col, func.count(User.id).label("n"))
            .filter(alive, col != "", col.isnot(None))
            .group_by(col)
            .having(func.count(User.id) > 1)
            .all()
        )
        for value, n in dup:
            rows = db.query(User).filter(alive, col == value).order_by(User.id).all()
            groups.append({
                "by": label,
                "value": value,
                "count": n,
                "users": [{
                    "id": u.id,
                    "nickname": u.nickname,
                    "phone": u.phone,
                    "openid": u.openid,
                    "oaOpenid": u.oa_openid,
                    "unionid": u.unionid,
                    "membership": u.membership_name,
                    "expireAt": u.membership_expire_at.isoformat() if u.membership_expire_at else None,
                    "createdAt": u.created_at.isoformat() if u.created_at else None,
                } for u in rows],
            })
    return groups
