import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import agent_service
from app.database import get_db
from app.lunar import lunar_info
from app.models import Admin, Agent, Cdkey, Order, Plan, Track, User
from app.schemas import ok
from app.security import require_perm
from app.user_merge import find_duplicates, merge_users

router = APIRouter(prefix="/api/admin", tags=["users-stats"])


def _agent_map(db: Session, user_ids: list[int]) -> dict[int, dict]:
    """user_id → 代理简讯。一次查完整页，别在 _user_dict 里逐行查（N+1）。"""
    if not user_ids:
        return {}
    rows = db.query(Agent).filter(Agent.user_id.in_(user_ids)).all()
    return {
        a.user_id: {"id": a.id, "code": a.code, "name": a.name, "status": a.status}
        for a in rows
        if a.user_id
    }


def _user_dict(u: User, agents: dict[int, dict] | None = None) -> dict:
    return {
        "id": u.id,
        "openid": u.openid,
        "unionid": u.unionid,
        "phone": u.phone,
        "nickname": u.nickname,
        "avatar": u.avatar,
        "element": u.element,
        "birthday": u.birthday.isoformat() if u.birthday else None,
        # 该用户是否已是代理：列表页显示标记 + 决定「设为代理」按钮的形态
        "agent": (agents or {}).get(u.id),
        "membership_type": u.membership_type,
        "membership_name": u.membership_name,
        "membership_source": u.membership_source,
        "membership_expire_at": (
            u.membership_expire_at.isoformat() if u.membership_expire_at else None
        ),
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


@router.get("/users")
def list_users(
    keyword: str | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("users:view")),
):
    # 已被合并的行是墓碑（历史订单仍指着它），不算真实账号，列表里不出现，
    # 要看它们走「重复账号」那一页
    q = db.query(User).filter(User.merged_into.is_(None))
    if keyword:
        q = q.filter(User.nickname.contains(keyword))
    total = q.count()
    rows = q.order_by(User.id.desc()).offset((page - 1) * size).limit(size).all()
    agents = _agent_map(db, [u.id for u in rows])
    return ok({"total": total, "items": [_user_dict(u, agents) for u in rows]})


@router.get("/users/duplicates")
def list_duplicate_users(
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("users:view")),
):
    """疑似重复账号。**必须声明在 /users/{user_id} 之前**，否则 "duplicates"
    会先去匹配那条路由并因为转不成 int 而 422。"""
    return ok(find_duplicates(db))


class MergeIn(BaseModel):
    into: int          # 保留哪条（另一条并入它）


@router.post("/users/{user_id}/merge")
def merge_user(
    user_id: int,
    body: MergeIn,
    db: Session = Depends(get_db),
    admin: Admin = Depends(require_perm("users:merge")),
):
    """把 user_id 并入 body.into。**不可逆**：订单、聆听历史、兑换记录都会改指向。

    自动合并只认 unionid（同一次微信授权拿到的两个标识，可证是同一个人）；
    手机号相同则一律走这里人工确认——家人共用号码是真实存在的。
    """
    drop = db.query(User).filter(User.id == user_id).first()
    keep = db.query(User).filter(User.id == body.into).first()
    if not drop or not keep:
        raise HTTPException(status_code=404, detail="用户不存在")
    if drop.id == keep.id:
        raise HTTPException(status_code=400, detail="不能与自己合并")
    if drop.merged_into or keep.merged_into:
        raise HTTPException(status_code=400, detail="所选账号已被合并过，请刷新后重试")

    detail = merge_users(db, keep, drop, reason="manual", operator=admin.username)
    db.commit()
    db.refresh(keep)
    return ok({"keep": _user_dict(keep), "detail": detail})


@router.get("/users/{user_id}")
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("users:view")),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    data = _user_dict(u, _agent_map(db, [u.id]))
    # 归因：这个用户是谁带来的（与「他自己是不是代理」是两回事）
    if u.agent_id:
        ref = db.query(Agent).filter(Agent.id == u.agent_id).first()
        data["referrer"] = (
            {"id": ref.id, "name": ref.name, "code": ref.code} if ref else None
        )
        data["agent_bound_at"] = u.agent_bound_at.isoformat() if u.agent_bound_at else None
    data["element_scores"] = json.loads(u.element_scores or "{}")
    data["quiz_completed_at"] = (
        u.quiz_completed_at.isoformat() if u.quiz_completed_at else None
    )
    data["birth_hour"] = u.birth_hour
    data["lunar"] = lunar_info(u.birthday, u.birth_hour)   # 农历/生肖/本命五行
    # 该用户的订单
    orders = (
        db.query(Order)
        .filter(Order.user_id == user_id)
        .order_by(Order.id.desc())
        .all()
    )
    data["orders"] = [
        {
            "id": o.id,
            "order_no": o.order_no,
            "plan_name": o.plan_name,
            "amount": o.amount,
            "status": o.status,
            "created_at": o.created_at.isoformat() if o.created_at else None,
        }
        for o in orders
    ]
    return ok(data)


class GrantIn(BaseModel):
    plan_id: str            # month/year/trial（free 视为取消会员）
    days: int | None = None  # 不传则用套餐默认时长


@router.post("/users/{user_id}/grant")
def grant_membership(
    user_id: int,
    body: GrantIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("users:grant")),
):
    """后台给用户开通/赠送会员（不走支付，source=gift）。"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if body.plan_id == "free":
        user.membership_type = "free"
        user.membership_name = "听闻"
        user.membership_expire_at = None
        user.membership_source = ""
        db.commit()
        db.refresh(user)
        return ok(_user_dict(user, _agent_map(db, [user.id])))

    plan = db.query(Plan).filter(Plan.id == body.plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="套餐不存在")

    days = body.days if body.days is not None else plan.duration_days
    if days <= 0:
        raise HTTPException(status_code=400, detail="开通天数必须大于 0")

    # 若当前会员仍有效，则在剩余期上叠加；否则从现在起算
    now = datetime.utcnow()
    base = user.membership_expire_at if (user.membership_expire_at and user.membership_expire_at > now) else now
    user.membership_type = plan.id
    user.membership_name = plan.name
    user.membership_expire_at = base + timedelta(days=days)
    user.membership_source = "gift"
    db.commit()
    db.refresh(user)
    return ok(_user_dict(user, _agent_map(db, [user.id])))


class SetAgentIn(BaseModel):
    name: str = ""              # 不填则取用户昵称
    type: str = "promoter"      # store 实体店 | promoter 网络推手


@router.post("/users/{user_id}/agent")
def set_user_as_agent(
    user_id: int,
    body: SetAgentIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("agents:manage")),
):
    """把用户设为代理。

    这是「开通代理权限」的正门——从用户出发，而不是去代理页手抄一个 user_id。
    上级按该用户当初绑定的代理**自动落定**（"我推广来的人成了代理，他就是我的下级"），
    落定后不再更改。
    """
    agent_service.require_enabled(db)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    exist = db.query(Agent).filter(Agent.user_id == user_id).first()
    if exist:
        raise HTTPException(status_code=400, detail=f"该用户已是代理（{exist.name} / {exist.code}）")
    if body.type not in ("store", "promoter"):
        raise HTTPException(status_code=400, detail="代理类型不合法")

    agent = agent_service.promote_user(db, user, name=body.name, type_=body.type)
    cfg = agent_service.agent_cfg(db)
    data = agent_service.agent_dict(agent, cfg)
    if agent.parent_id:
        p = db.query(Agent).filter(Agent.id == agent.parent_id).first()
        data["parentName"] = p.name if p else ""
    return ok(data)


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), _: Admin = Depends(require_perm("dashboard:view"))):
    return ok({
        "users": db.query(User).count(),
        "premium_users": db.query(User).filter(User.membership_type != "free").count(),
        "tracks": db.query(Track).count(),
        "cdkeys_total": db.query(Cdkey).count(),
        "cdkeys_used": db.query(Cdkey).filter(Cdkey.status == "used").count(),
        "orders_paid": db.query(Order).filter(Order.status == "paid").count(),
        "orders_refunded": db.query(Order).filter(Order.status == "refunded").count(),
    })
