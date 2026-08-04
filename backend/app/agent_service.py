"""代理分成：配置开关、归因绑定、分成产生与冲正、可提现余额。

单独成文件而不塞进 mp.py——后者已 1400+ 行，再往里加就没法看了。

**整个模块默认关闭**（agent_config.enabled 缺省 false）。未开启时不仅接口不通，
更关键的是**一分钱的分成记录都不产生**——不是"记了不显示"。否则日后一旦打开，
会凭空冒出一批谁也解释不清的历史欠账。
"""

import json
import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Agent, Commission, Order, Setting, User, Withdrawal

AGENT_KEY = "agent_config"

# 推广码字符集：与 CDKEY / 礼物码同口径，去掉易混的 0/O/1/I。
# 没有从 mp.py 导入是因为 mp.py 反过来要 import 本模块，会成环。
CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LEN = 6

DEFAULTS: dict = {
    "enabled": False,        # ← 总开关，默认关
    "default_rate": 0.2,     # 一级（直推）分成比例，基数是订单金额
    # 上级加成比例，基数同样是**订单金额**，由平台**额外**支出（不从下级那份里扣）：
    # 订单 ¥100、一级 20%、加成 5% → 直推 ¥20、上级 ¥5、平台这单出 ¥25。
    #
    # ⚠️ 键名是从 default_rate2 改过来的（v1.6.0）。旧键的语义是"从下级那份里抽的占比"，
    #    默认 0.25；agent_cfg 用 {**DEFAULTS, **saved} 合并，若沿用旧键名，存量库里
    #    存过的 0.25 会被当成"订单额的 25%"照旧生效，上级分成静默翻 5 倍。改名即失效。
    "default_bonus_rate": 0.05,
    "freeze_days": 7,        # 分成冻结天数（覆盖退款窗口）
    "min_withdraw": 10.0,    # 最低提现金额（元）
    "payout_mode": "manual", # manual 线下打款 | wxpay 微信商家转账
}


# ── 配置与开关 ──
def agent_cfg(db: Session) -> dict:
    row = db.query(Setting).filter(Setting.key == AGENT_KEY).first()
    try:
        saved = json.loads(row.value) if row and row.value else {}
    except ValueError:
        saved = {}
    return {**DEFAULTS, **saved}


def is_enabled(db: Session) -> bool:
    return bool(agent_cfg(db).get("enabled"))


def require_enabled(db: Session) -> dict:
    """未开启即 404。

    刻意不用 403：403 等于对外承认「有这个功能，只是关着」，
    而这个模块的要求就是关闭时不留任何痕迹。
    """
    cfg = agent_cfg(db)
    if not cfg.get("enabled"):
        raise HTTPException(status_code=404, detail="Not Found")
    return cfg


def rate_of(agent: Agent, cfg: dict) -> float:
    """代理实际比例：单独设过就用自己的，没设（None）才落到全局默认。
    注意 0 是合法值（不分成），所以判定必须用 is None 而不是真值判断。"""
    if agent.commission_rate is None:
        return float(cfg.get("default_rate") or 0)
    return float(agent.commission_rate)


def rate2_of(agent: Agent, cfg: dict) -> float:
    """该代理**作为上级**时，下级每成一单他额外拿订单额的多少。口径同 rate_of。

    基数是**订单金额**，且由平台额外支出——不从下级那份里扣，下级实拿不受影响。
    ¥100 的单子、加成 5% → 上级拿 ¥5，直推照样拿满自己的 20%。

    （列名仍是 commission_rate2 是为了不动 DB 与后台字段；语义已在 v1.6.0 改掉。）
    """
    if agent.commission_rate2 is None:
        return float(cfg.get("default_bonus_rate") or 0)
    return float(agent.commission_rate2)


def parent_of(db: Session, agent: Agent) -> Agent | None:
    """直接上级。**只往上一跳，绝不递归**——计酬层级封顶为 2 是红线。"""
    if not agent or not agent.parent_id:
        return None
    return (
        db.query(Agent)
        .filter(Agent.id == agent.parent_id, Agent.status == "active")
        .first()
    )


# ── 推广码 ──
def gen_code(db: Session) -> str:
    for _ in range(50):
        code = "".join(secrets.choice(CODE_CHARSET) for _ in range(CODE_LEN))
        if not db.query(Agent.id).filter(Agent.code == code).first():
            return code
    raise HTTPException(status_code=500, detail="生成推广码失败，请重试")


# ── 归因绑定 ──
def agent_of_user(db: Session, user: User) -> Agent | None:
    """该用户本人是不是代理（用于代理中心认人）。"""
    if not user:
        return None
    return (
        db.query(Agent)
        .filter(Agent.user_id == user.id, Agent.status == "active")
        .first()
    )


def bind_agent(db: Session, user: User, code: str) -> dict:
    """首次扫码永久绑定。返回 {bound, reason}，reason 供调用方决定要不要提示。

    已绑定的用户再扫别人的码 → 静默成功（不改绑）。对用户而言这不是错误，
    弹「绑定失败」只是噪音。
    """
    if user.agent_id:
        return {"bound": False, "reason": "already"}

    code = (code or "").strip().upper()
    if not code:
        return {"bound": False, "reason": "empty"}

    agent = db.query(Agent).filter(Agent.code == code).first()
    if not agent or agent.status != "active":
        return {"bound": False, "reason": "invalid"}

    # 自购返佣：代理拿自己的码绑自己，等于给自己全场打折
    if agent.user_id and agent.user_id == user.id:
        return {"bound": False, "reason": "self"}

    user.agent_id = agent.id
    user.agent_bound_at = datetime.utcnow()
    db.commit()
    return {"bound": True, "reason": "ok", "agentName": agent.name}


# ── 分成产生 ──
def record_commission(db: Session, order: Order) -> list[Commission]:
    """订单转 paid 时记分成。有上级则落两条，否则一条。

    **只 add / flush，不 commit**——由调用方与「订单置为已支付」一起提交，
    保证两者原子生效，不会出现"订单已付款但分成没记上"的中间态。

    算法（加法模型：直推恒定拿满，上级那份由平台**额外**支出）：

        direct = 订单额 × 直推代理的一级比例    ← 与有没有上级无关，恒定
        bonus  = 订单额 × 上级的加成比例        ← 平台额外支出

    平台总支出随有无上级浮动：无上级 20%、有上级 25%（按默认配置）。
    两条**各自独立取整**，没有跨行不变量——对账口径是按单汇总：

        平台为某单的支出 = SUM(amount WHERE order_id=X AND status != 'void')

    因此合计与 订单额×(r1+r2) 可能差 ±0.01（¥33.33 × 20%/5% → 6.67 + 1.67 = 8.34，
    理论值 8.33）。这是可接受的，别再去凑那一分钱。

    幂等：一单要么两条都在、要么都不在，所以只需判断该订单有没有任何记录；
    并发的兜底是 (order_id, level) 的复合唯一约束。
    """
    cfg = agent_cfg(db)
    if not cfg.get("enabled"):
        return []
    if not order or order.status != "paid":
        return []

    user = db.query(User).filter(User.id == order.user_id).first()
    if not user or not user.agent_id:
        return []

    agent = db.query(Agent).filter(Agent.id == user.agent_id).first()
    if not agent or agent.status != "active":
        return []

    # 已记过就别再记（正常重复回调走这里，唯一约束是并发时的兜底）
    if db.query(Commission.id).filter(Commission.order_id == order.id).first():
        return []

    # 比例来自自由填写的 JSON 配置与代理行，两处都钳一遍再用。
    amount = float(order.amount or 0)
    rate = min(max(rate_of(agent, cfg), 0.0), 1.0)
    direct = round(amount * rate, 2)

    # 只往上一跳。**绝不递归**——三级及以上是红线。
    # 上级被停用则没有加成，且直推照样拿满（旧的减法模型下停用上级会让直推多拿钱，
    # 那是个反向激励；加法模型下上下级互不影响）。
    parent = parent_of(db, agent)
    rate2 = min(max(rate2_of(parent, cfg), 0.0), 1.0) if parent else 0.0
    bonus = round(amount * rate2, 2) if parent else 0.0

    # 兜底：两个比例分别来自**两个不同的代理行**，各自 ≤1 也能相加超过 1，
    # 最坏能付出订单额的 200%。超了就削**上级加成**——直推那个数是印在海报上
    # 跟人谈好的，不能动；而付出去的钱冻结期一过就追不回来了。
    if direct + bonus > amount:
        bonus = max(0.0, round(amount - direct, 2))

    # 本单平台总支出，两条存同一个值：加法模型下总支出会浮动（有无上级差一截），
    # 后台再也没法从 rate 反推成本，靠这个列一眼看出「这单一共出了多少」。
    platform_cost = round(direct + bonus, 2)

    freeze_days = int(cfg.get("freeze_days") or 0)
    available_at = datetime.utcnow() + timedelta(days=freeze_days)
    rows: list[Commission] = []

    if direct > 0:
        rows.append(Commission(
            agent_id=agent.id, order_id=order.id, level=1, user_id=user.id,
            order_amount=order.amount, base_amount=platform_cost, rate=rate, amount=direct,
            status="pending", available_at=available_at,
        ))
    if parent and bonus > 0:
        rows.append(Commission(
            agent_id=parent.id, order_id=order.id, level=2, user_id=user.id,
            order_amount=order.amount, base_amount=platform_cost,
            rate=rate2,                  # level=2 存的是加成比例，基数同为订单额
            amount=bonus, status="pending", available_at=available_at,
            source_agent_id=agent.id,
        ))
    if not rows:
        # 两个比例都是 0 才会走到这（直推 0% 但上级有加成时，上级那条照样要记——
        # 这正是旧代码 `if base <= 0: return []` 会吞掉的场景）。
        return []

    try:
        with db.begin_nested():   # SAVEPOINT：撞唯一键只回滚这一步，不牵连订单状态
            for r in rows:
                db.add(r)
            db.flush()
    except IntegrityError:
        return []
    return rows


def void_commission(db: Session, order: Order, reason: str = "订单退款") -> list[Commission]:
    """订单退款时冲正分成。同样只改不 commit，由调用方提交。

    ⚠️ 必须把该订单下的**所有**记录都作废（直推 + 上级抽成）。
    这里曾经是 .first()，只冲正直推那条，上级的抽成会留在账上照样能提走。

    已经打款出去的（withdrawing/paid）钱追不回来：标记 clawback 让后台看得见，
    由人工向代理追讨。freeze_days 的全部意义就是让这种情况尽量别发生。
    """
    rows = db.query(Commission).filter(Commission.order_id == order.id).all()
    changed: list[Commission] = []
    for row in rows:
        if row.status == "void":
            continue
        row.clawback = row.status in ("withdrawing", "paid")
        row.status = "void"
        row.void_reason = reason
        changed.append(row)
    return changed


# ── 余额 ──
def _available_filter():
    """可提现：已解冻的，或冻结期已过的 pending。"""
    now = datetime.utcnow()
    return or_(
        Commission.status == "available",
        (Commission.status == "pending") & (Commission.available_at <= now),
    )


def _sum(db: Session, agent_id: int, *conds) -> float:
    q = db.query(Commission.amount).filter(Commission.agent_id == agent_id, *conds)
    return round(sum(float(a or 0) for (a,) in q.all()), 2)


def balance_of(db: Session, agent_id: int) -> dict:
    """代理的四种钱：可提现 / 冻结中 / 提现处理中 / 已到账。"""
    now = datetime.utcnow()
    return {
        "available": _sum(db, agent_id, _available_filter()),
        "frozen": _sum(
            db, agent_id, Commission.status == "pending", Commission.available_at > now
        ),
        "withdrawing": _sum(db, agent_id, Commission.status == "withdrawing"),
        "paid": _sum(db, agent_id, Commission.status == "paid"),
    }


def pick_for_withdraw(db: Session, agent_id: int, amount: float) -> list[Commission]:
    """按时间顺序取够 amount 的可提现记录，加行锁。

    行锁在 MySQL（生产）有效，SQLite（本地）是空操作——
    所以「并发提现只能成功一笔」这条必须在 MySQL 上验，本地测不出来。
    """
    rows = (
        db.query(Commission)
        .filter(Commission.agent_id == agent_id, _available_filter())
        .order_by(Commission.created_at.asc(), Commission.id.asc())
        .with_for_update()
        .all()
    )
    picked: list[Commission] = []
    total = 0.0
    for r in rows:
        if total >= amount - 0.001:
            break
        picked.append(r)
        total = round(total + float(r.amount or 0), 2)
    if total < amount - 0.001:
        return []
    return picked


def has_open_withdrawal(db: Session, agent_id: int) -> bool:
    """同一代理同时只允许一笔在途，避免并发把余额提两次。"""
    return bool(
        db.query(Withdrawal.id)
        .filter(
            Withdrawal.agent_id == agent_id,
            Withdrawal.status.in_(("pending", "approved")),
        )
        .first()
    )


def agent_dict(agent: Agent, cfg: dict | None = None) -> dict:
    return {
        "id": agent.id,
        "code": agent.code,
        "name": agent.name,
        "type": agent.type,
        "userId": agent.user_id,
        "phone": agent.phone,
        "realName": agent.real_name,
        "contact": agent.contact,
        "remark": agent.remark,
        # rate 为 None 表示跟随全局默认；effectiveRate 是实际生效值
        "rate": agent.commission_rate,
        "effectiveRate": rate_of(agent, cfg) if cfg else None,
        # rate2 = 作为上级时，下级每成一单自己额外拿订单额的多少（平台额外支出）
        "rate2": agent.commission_rate2,
        "effectiveRate2": rate2_of(agent, cfg) if cfg else None,
        "parentId": agent.parent_id,
        "status": agent.status,
        "createdAt": agent.created_at.isoformat() if agent.created_at else None,
    }


def promote_user(db: Session, user: User, name: str = "", type_: str = "promoter") -> Agent:
    """把一个用户提升为代理。

    上级按用户当初绑定的代理**自动落定**——"我推广来的人成了代理，他就是我的下级"，
    这是最符合直觉的口径，也免去手工指认。落定后不再更改。
    调用方需先确认该用户还不是代理。
    """
    agent = Agent(
        code=gen_code(db),
        name=(name or user.nickname or f"代理{user.id}").strip(),
        type=type_ if type_ in ("store", "promoter") else "promoter",
        user_id=user.id,
        phone=user.phone or "",
        parent_id=user.agent_id,   # 可能为 None（本来就没人推荐他）
        status="active",
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


def downline_of(db: Session, agent_id: int) -> dict:
    """直接下级代理 + 名下用户。**只看一层**——下级的下级与本代理无关。"""
    subs = (
        db.query(Agent)
        .filter(Agent.parent_id == agent_id)
        .order_by(Agent.created_at.desc())
        .all()
    )
    # 每个下级为本代理贡献了多少（即 level=2、source 是该下级的那些抽成）
    contrib: dict[int, float] = {}
    rows = (
        db.query(Commission.source_agent_id, Commission.amount)
        .filter(
            Commission.agent_id == agent_id,
            Commission.level == 2,
            Commission.status != "void",
        )
        .all()
    )
    for sid, amt in rows:
        if sid:
            contrib[sid] = round(contrib.get(sid, 0.0) + float(amt or 0), 2)

    sub_items = []
    for s in subs:
        sub_items.append({
            "id": s.id,
            "name": s.name,
            "code": s.code,
            "type": s.type,
            "status": s.status,
            "phone": s.phone,
            "userCount": db.query(User.id).filter(User.agent_id == s.id).count(),
            "contributed": contrib.get(s.id, 0.0),   # 该下级为我带来的抽成
            "createdAt": s.created_at.isoformat() if s.created_at else None,
        })

    users = (
        db.query(User)
        .filter(User.agent_id == agent_id)
        .order_by(User.agent_bound_at.desc())
        .limit(200)
        .all()
    )
    return {
        "subAgents": sub_items,
        "subAgentCount": len(sub_items),
        "userCount": db.query(User.id).filter(User.agent_id == agent_id).count(),
        "users": [{
            "id": u.id,
            "nickname": u.nickname,
            "avatar": u.avatar,
            "phone": u.phone,
            "membershipName": u.membership_name,
            "boundAt": u.agent_bound_at.isoformat() if u.agent_bound_at else None,
        } for u in users],
    }
