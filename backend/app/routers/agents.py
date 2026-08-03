"""代理分成管理端。

整体挂在 agent_service.require_enabled 后面——模块没开就 404。
唯一的例外是 settings.py 里的 /settings/agent，那是开启入口，挡住就没人能打开了。
"""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import agent_service, wxpay
from app.database import get_db
from app.models import Admin, Agent, Commission, Setting, User, Withdrawal
from app.schemas import ok
from app.security import require_perm

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/admin", tags=["agents"])


def _pay_cfg(db: Session) -> dict:
    import json
    row = db.query(Setting).filter(Setting.key == "pay_config").first()
    return json.loads(row.value) if row and row.value else {}


# ── 代理 ──
class AgentIn(BaseModel):
    name: str
    type: str = "store"                  # store 实体店 | promoter 网络推手
    phone: str = ""
    real_name: str = ""
    contact: str = ""
    remark: str = ""
    # None = 跟随全局默认比例。0 是合法值（不分成），所以不能拿 0 当"未设置"
    commission_rate: float | None = Field(default=None, ge=0, le=1)
    status: str = "active"
    user_id: int | None = None


@router.get("/agents")
def list_agents(
    page: int = 1,
    size: int = 20,
    keyword: str = "",
    type: str = "",
    status: str = "",
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("agents:view")),
):
    cfg = agent_service.require_enabled(db)
    q = db.query(Agent)
    if keyword:
        like = f"%{keyword}%"
        q = q.filter((Agent.name.like(like)) | (Agent.code.like(like)) | (Agent.phone.like(like)))
    if type:
        q = q.filter(Agent.type == type)
    if status:
        q = q.filter(Agent.status == status)

    total = q.count()
    size = max(1, min(size, 100))
    rows = (
        q.order_by(Agent.created_at.desc())
        .offset((max(page, 1) - 1) * size)
        .limit(size)
        .all()
    )
    items = []
    for a in rows:
        d = agent_service.agent_dict(a, cfg)
        d["balance"] = agent_service.balance_of(db, a.id)
        items.append(d)
    return ok({"total": total, "items": items})


@router.post("/agents")
def create_agent(
    body: AgentIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("agents:manage")),
):
    cfg = agent_service.require_enabled(db)
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="代理名称不能为空")
    if body.type not in ("store", "promoter"):
        raise HTTPException(status_code=400, detail="代理类型不合法")
    _check_user_id(db, body.user_id, exclude_agent_id=None)

    agent = Agent(
        code=agent_service.gen_code(db),
        name=name,
        type=body.type,
        phone=(body.phone or "").strip(),
        real_name=(body.real_name or "").strip(),
        contact=body.contact or "",
        remark=body.remark or "",
        commission_rate=body.commission_rate,
        status="active",
        user_id=body.user_id,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return ok(agent_service.agent_dict(agent, cfg))


def _check_user_id(db: Session, user_id: int | None, exclude_agent_id: int | None) -> None:
    """一个用户账号只能是一个代理，否则代理中心不知道该认哪个身份。"""
    if not user_id:
        return
    if not db.query(User.id).filter(User.id == user_id).first():
        raise HTTPException(status_code=400, detail="关联的用户不存在")
    q = db.query(Agent.id).filter(Agent.user_id == user_id)
    if exclude_agent_id:
        q = q.filter(Agent.id != exclude_agent_id)
    if q.first():
        raise HTTPException(status_code=400, detail="该用户已关联其它代理")


@router.put("/agents/{agent_id}")
def update_agent(
    agent_id: int,
    body: AgentIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("agents:manage")),
):
    cfg = agent_service.require_enabled(db)
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="代理不存在")
    if body.type not in ("store", "promoter"):
        raise HTTPException(status_code=400, detail="代理类型不合法")
    if body.status not in ("active", "disabled"):
        raise HTTPException(status_code=400, detail="状态不合法")
    _check_user_id(db, body.user_id, exclude_agent_id=agent.id)

    agent.name = (body.name or agent.name).strip()
    agent.type = body.type
    agent.phone = (body.phone or "").strip()
    agent.real_name = (body.real_name or "").strip()
    agent.contact = body.contact or ""
    agent.remark = body.remark or ""
    # 改比例只影响之后的新订单——历史 commission 存的是成交时点快照，不回溯
    agent.commission_rate = body.commission_rate
    agent.status = body.status
    agent.user_id = body.user_id
    db.commit()
    db.refresh(agent)
    return ok(agent_service.agent_dict(agent, cfg))


@router.post("/agents/{agent_id}/disable")
def disable_agent(
    agent_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("agents:manage")),
):
    """停用：不再产生新分成，也进不了代理中心。
    已产生的分成不动——那是已经挣到的钱，停用不该没收。"""
    agent_service.require_enabled(db)
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="代理不存在")
    agent.status = "disabled" if agent.status == "active" else "active"
    db.commit()
    return ok({"status": agent.status})


# ── 分成明细 ──
@router.get("/commissions")
def list_commissions(
    page: int = 1,
    size: int = 20,
    agent_id: int = 0,
    status: str = "",
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("agents:view")),
):
    agent_service.require_enabled(db)
    q = db.query(Commission)
    if agent_id:
        q = q.filter(Commission.agent_id == agent_id)
    if status:
        q = q.filter(Commission.status == status)

    total = q.count()
    size = max(1, min(size, 100))
    rows = (
        q.order_by(Commission.created_at.desc())
        .offset((max(page, 1) - 1) * size)
        .limit(size)
        .all()
    )
    names = {a.id: a.name for a in db.query(Agent).all()}
    return ok({
        "total": total,
        "items": [{
            "id": r.id,
            "agentId": r.agent_id,
            "agentName": names.get(r.agent_id, ""),
            "orderId": r.order_id,
            "userId": r.user_id,
            "orderAmount": r.order_amount,
            "rate": r.rate,
            "amount": r.amount,
            "status": r.status,
            # 已打款之后才退的款：钱追不回来，后台要能一眼看见
            "clawback": r.clawback,
            "voidReason": r.void_reason,
            "availableAt": r.available_at.isoformat() if r.available_at else None,
            "createdAt": r.created_at.isoformat() if r.created_at else None,
        } for r in rows],
    })


# ── 提现审核 ──
def _release(db: Session, wd: Withdrawal) -> None:
    """把提现单占用的分成放回可提现池。

    驳回与打款失败都要走这里——钱没出去就必须能再提，
    漏了这一步余额会凭空消失，而且代理自己查不出原因。
    """
    rows = db.query(Commission).filter(Commission.withdrawal_id == wd.id).all()
    for r in rows:
        if r.status == "withdrawing":
            r.status = "available"
            r.withdrawal_id = None


@router.get("/withdrawals")
def list_withdrawals(
    page: int = 1,
    size: int = 20,
    status: str = "",
    agent_id: int = 0,
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("agents:view")),
):
    agent_service.require_enabled(db)
    q = db.query(Withdrawal)
    if status:
        q = q.filter(Withdrawal.status == status)
    if agent_id:
        q = q.filter(Withdrawal.agent_id == agent_id)

    total = q.count()
    size = max(1, min(size, 100))
    rows = (
        q.order_by(Withdrawal.created_at.desc())
        .offset((max(page, 1) - 1) * size)
        .limit(size)
        .all()
    )
    agents = {a.id: a for a in db.query(Agent).all()}
    items = []
    for r in rows:
        a = agents.get(r.agent_id)
        items.append({
            "id": r.id,
            "agentId": r.agent_id,
            "agentName": a.name if a else "",
            "agentPhone": a.phone if a else "",
            "agentRealName": a.real_name if a else "",
            "amount": r.amount,
            "status": r.status,
            "payoutMode": r.payout_mode,
            "transferNo": r.transfer_no,
            "wxTransferId": r.wx_transfer_id,
            "failReason": r.fail_reason,
            "reviewedBy": r.reviewed_by,
            "reviewedAt": r.reviewed_at.isoformat() if r.reviewed_at else None,
            "paidAt": r.paid_at.isoformat() if r.paid_at else None,
            "remark": r.remark,
            "createdAt": r.created_at.isoformat() if r.created_at else None,
        })
    return ok({"total": total, "items": items})


class ReviewIn(BaseModel):
    remark: str = ""


@router.post("/withdrawals/{wid}/reject")
def reject_withdrawal(
    wid: int,
    body: ReviewIn,
    db: Session = Depends(get_db),
    admin: Admin = Depends(require_perm("agents:settle")),
):
    agent_service.require_enabled(db)
    wd = db.query(Withdrawal).filter(Withdrawal.id == wid).first()
    if not wd:
        raise HTTPException(status_code=404, detail="提现单不存在")
    if wd.status not in ("pending", "approved"):
        raise HTTPException(status_code=400, detail="该提现单已结束，不能驳回")

    wd.status = "rejected"
    wd.remark = body.remark or ""
    wd.reviewed_by = admin.username
    wd.reviewed_at = datetime.utcnow()
    _release(db, wd)
    db.commit()
    return ok({"status": wd.status})


@router.post("/withdrawals/{wid}/approve")
def approve_withdrawal(
    wid: int,
    body: ReviewIn,
    db: Session = Depends(get_db),
    admin: Admin = Depends(require_perm("agents:settle")),
):
    """审核通过。

    payout_mode=manual（默认）：只置为「待打款」，由管理员线下转账后再点「标记已打款」。
    payout_mode=wxpay：直接调微信商家转账；失败则置 failed 并把金额放回可提现池
    （钱没出去就必须能再提）。
    """
    cfg = agent_service.require_enabled(db)
    wd = db.query(Withdrawal).filter(Withdrawal.id == wid).first()
    if not wd:
        raise HTTPException(status_code=404, detail="提现单不存在")
    if wd.status != "pending":
        raise HTTPException(status_code=400, detail="仅待审核的提现单可通过")

    wd.reviewed_by = admin.username
    wd.reviewed_at = datetime.utcnow()
    wd.remark = body.remark or ""

    if str(cfg.get("payout_mode") or "manual") != "wxpay":
        wd.status = "approved"
        wd.payout_mode = "manual"
        db.commit()
        return ok({"status": wd.status, "payoutMode": wd.payout_mode})

    # 微信自动转账
    agent = db.query(Agent).filter(Agent.id == wd.agent_id).first()
    payee = db.query(User).filter(User.id == agent.user_id).first() if agent and agent.user_id else None
    wd.payout_mode = "wxpay"
    wd.transfer_no = wd.transfer_no or f"WD{wd.id}{int(wd.created_at.timestamp())}"
    try:
        res = wxpay.transfer(
            _pay_cfg(db),
            openid=payee.openid if payee else "",
            out_bill_no=wd.transfer_no,
            amount_fen=int(round(float(wd.amount) * 100)),
            remark="分成提现",
        )
        wd.status = "paid"
        wd.wx_transfer_id = str(res.get("transfer_bill_no") or res.get("out_bill_no") or "")
        wd.paid_at = datetime.utcnow()
        for r in db.query(Commission).filter(Commission.withdrawal_id == wd.id).all():
            r.status = "paid"
    except wxpay.WxPayError as e:
        logger.warning("提现转账失败 #%s：%s", wd.id, e)
        wd.status = "failed"
        wd.fail_reason = str(e)[:255]
        _release(db, wd)
    db.commit()
    return ok({"status": wd.status, "failReason": wd.fail_reason})


@router.post("/withdrawals/{wid}/paid")
def mark_paid(
    wid: int,
    body: ReviewIn,
    db: Session = Depends(get_db),
    admin: Admin = Depends(require_perm("agents:settle")),
):
    """线下转账完成后手工标记已打款（payout_mode=manual 的收尾动作）。"""
    agent_service.require_enabled(db)
    wd = db.query(Withdrawal).filter(Withdrawal.id == wid).first()
    if not wd:
        raise HTTPException(status_code=404, detail="提现单不存在")
    if wd.status != "approved":
        raise HTTPException(status_code=400, detail="仅待打款的提现单可标记")

    wd.status = "paid"
    wd.paid_at = datetime.utcnow()
    wd.reviewed_by = admin.username
    if body.remark:
        wd.remark = body.remark
    for r in db.query(Commission).filter(Commission.withdrawal_id == wd.id).all():
        r.status = "paid"
    db.commit()
    return ok({"status": wd.status})


# ── 概览 ──
@router.get("/agents-summary")
def agents_summary(
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("agents:view")),
):
    """代理页顶部的几个数：代理数、待审核提现数、累计分成、待结算。"""
    agent_service.require_enabled(db)
    rows = db.query(Commission.amount, Commission.status).all()
    total = round(sum(float(a or 0) for a, s in rows if s != "void"), 2)
    unsettled = round(sum(float(a or 0) for a, s in rows if s in ("pending", "available", "withdrawing")), 2)
    return ok({
        "agents": db.query(Agent).filter(Agent.status == "active").count(),
        "pendingWithdrawals": db.query(Withdrawal).filter(Withdrawal.status == "pending").count(),
        "totalCommission": total,
        "unsettled": unsettled,
    })
