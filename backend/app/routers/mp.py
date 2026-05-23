"""小程序/APP 端公开接口（用户态）。

真实环境中 wx-login 需用 code 调微信换 openid/unionid；此处接口约定为前端传
已换取的 openid/unionid（或服务端换取后调用），便于联调与 APP 复用。
鉴权：登录返回用户 JWT（sub=user:<id>），后续接口用 Bearer 携带。
"""
import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Cdkey, CdkeyRedeemLog, Element, Plan, Track, User

router = APIRouter(prefix="/api/mp", tags=["miniprogram"])


def ok(data=None, msg="ok"):
    return {"code": 0, "data": data, "msg": msg}


# ── 用户 JWT（与管理员区分，sub 前缀 user:）──
def create_user_token(user_id: int) -> str:
    payload = {
        "sub": f"user:{user_id}",
        "exp": datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def get_current_user(
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> User:
    exc = HTTPException(status_code=401, detail="登录态无效或已过期")
    if not authorization.startswith("Bearer "):
        raise exc
    token = authorization[7:]
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        sub = payload.get("sub", "")
        if not sub.startswith("user:"):
            raise exc
        uid = int(sub.split(":", 1)[1])
    except (JWTError, ValueError):
        raise exc
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise exc
    return user


def _is_premium(u: User) -> bool:
    return (
        u.membership_type != "free"
        and u.membership_expire_at is not None
        and u.membership_expire_at > datetime.utcnow()
    )


def _user_dict(u: User) -> dict:
    return {
        "id": u.id,
        "openid": u.openid,
        "unionid": u.unionid,
        "phone": u.phone,
        "nickname": u.nickname,
        "avatar": u.avatar,
        "element": u.element,
        "elementScores": json.loads(u.element_scores or "{}"),
        "quizCompletedAt": u.quiz_completed_at.isoformat() if u.quiz_completed_at else None,
        "isPremium": _is_premium(u),
        "membership": {
            "type": u.membership_type,
            "name": u.membership_name,
            "expireAt": u.membership_expire_at.isoformat() if u.membership_expire_at else None,
            "source": u.membership_source,
        },
        "createdAt": u.created_at.isoformat() if u.created_at else None,
    }


# ── 登录 ──
class LoginIn(BaseModel):
    openid: str
    unionid: str = ""
    nickname: str = ""
    avatar: str = ""


@router.post("/login")
def mp_login(body: LoginIn, db: Session = Depends(get_db)):
    """登录：优先按 unionid 识别（跨小程序/APP 同账号），无则按 openid。"""
    user = None
    if body.unionid:
        user = db.query(User).filter(User.unionid == body.unionid).first()
    if not user:
        user = db.query(User).filter(User.openid == body.openid).first()

    if not user:
        user = User(
            openid=body.openid,
            unionid=body.unionid,
            nickname=body.nickname or "律音用户",
            avatar=body.avatar,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        changed = False
        if body.unionid and not user.unionid:
            user.unionid = body.unionid
            changed = True
        if body.avatar and not user.avatar:
            user.avatar = body.avatar
            changed = True
        if changed:
            db.commit()
            db.refresh(user)

    token = create_user_token(user.id)
    return ok({"token": token, "user": _user_dict(user)})


# ── 我的资料 ──
@router.get("/profile")
def mp_profile(user: User = Depends(get_current_user)):
    return ok(_user_dict(user))


@router.get("/membership")
def mp_membership(user: User = Depends(get_current_user)):
    return ok({
        "type": user.membership_type,
        "name": user.membership_name,
        "expireAt": user.membership_expire_at.isoformat() if user.membership_expire_at else None,
        "source": user.membership_source,
        "isPremium": _is_premium(user),
    })


# ── 绑定手机号 ──
class BindPhoneIn(BaseModel):
    phone: str


@router.post("/bind-phone")
def bind_phone(
    body: BindPhoneIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not body.phone or len(body.phone) < 6:
        raise HTTPException(status_code=400, detail="手机号不合法")
    user.phone = body.phone
    db.commit()
    db.refresh(user)
    return ok({"phone": user.phone})


# ── 测评提交 ──
class QuizIn(BaseModel):
    element: str
    scores: dict


@router.post("/quiz")
def mp_quiz(
    body: QuizIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user.element = body.element
    user.element_scores = json.dumps(body.scores, ensure_ascii=False)
    user.quiz_completed_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return ok(_user_dict(user))


# ── 五行 + 曲目（公开，免登录）──
def _track_dict(t: Track) -> dict:
    return {
        "id": t.id,
        "title": t.title,
        "duration": t.duration,
        "durationSec": t.duration_sec,
        "hz": t.hz,
        "tag": t.tag,
        "plays": t.plays,
        "audioUrl": t.audio_url,
        "coverUrl": t.cover_url,
        "isPremium": t.is_premium,
        "previewSec": t.preview_sec,
    }


@router.get("/elements")
def mp_elements(db: Session = Depends(get_db)):
    els = db.query(Element).order_by(Element.sort).all()
    result = []
    for e in els:
        tracks = (
            db.query(Track)
            .filter(Track.element_id == e.id, Track.is_online == True)  # noqa: E712
            .order_by(Track.sort)
            .all()
        )
        result.append({
            "id": e.id,
            "en": e.en,
            "icon": e.icon,
            "primary": e.primary,
            "accent": e.accent,
            "glow": e.glow,
            "bg": e.bg,
            "note": e.note,
            "notePinyin": e.note_pinyin,
            "organ": e.organ,
            "season": e.season,
            "quality": e.quality,
            "desc": e.desc,
            "sleepTip": e.sleep_tip,
            "tracks": [_track_dict(t) for t in tracks],
        })
    return ok(result)


@router.get("/plans")
def mp_plans(db: Session = Depends(get_db)):
    rows = db.query(Plan).filter(Plan.is_active == True).order_by(Plan.sort).all()  # noqa: E712
    return ok([
        {
            "id": p.id, "name": p.name, "en": p.en, "price": p.price,
            "original": p.original, "unit": p.unit, "badge": p.badge,
            "features": json.loads(p.features or "[]"), "featured": p.featured,
        }
        for p in rows
    ])


# ── CDKEY 兑换（真实）──
class RedeemIn(BaseModel):
    code: str


@router.post("/cdkey/redeem")
def mp_redeem(
    body: RedeemIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    code = body.code.strip().upper()
    key = db.query(Cdkey).filter(Cdkey.code == code).first()
    if not key:
        raise HTTPException(status_code=400, detail="兑换码不存在")
    if key.status == "used":
        raise HTTPException(status_code=400, detail="兑换码已被使用")
    if key.status in ("disabled", "expired"):
        raise HTTPException(status_code=400, detail="兑换码不可用")
    if key.expire_at and key.expire_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="兑换码已过期")

    # 发放权益：剩余期叠加
    now = datetime.utcnow()
    base = user.membership_expire_at if (user.membership_expire_at and user.membership_expire_at > now) else now
    expire_at = base + timedelta(days=key.duration_days)
    user.membership_type = key.plan_type
    user.membership_name = key.plan_name
    user.membership_expire_at = expire_at
    user.membership_source = "cdkey"

    key.status = "used"
    key.used_by = user.id
    key.used_at = now
    db.add(CdkeyRedeemLog(user_id=user.id, cdkey_id=key.id))
    db.commit()
    db.refresh(user)

    return ok({
        "plan": key.plan_name,
        "type": key.plan_type,
        "days": key.duration_days,
        "expireAt": expire_at.isoformat(),
        "membership": _user_dict(user)["membership"],
    })


# ── 下单（开发期：直接开通；生产接微信统一下单）──
class CreateOrderIn(BaseModel):
    planId: str


@router.post("/pay/create-order")
def mp_create_order(
    body: CreateOrderIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    plan = db.query(Plan).filter(Plan.id == body.planId).first()
    if not plan:
        raise HTTPException(status_code=404, detail="套餐不存在")
    # TODO 生产：调用微信统一下单返回支付参数，回调成功后再开通。
    # 开发期无证书，直接开通便于联调。
    now = datetime.utcnow()
    base = user.membership_expire_at if (user.membership_expire_at and user.membership_expire_at > now) else now
    expire_at = base + timedelta(days=plan.duration_days)
    user.membership_type = plan.id
    user.membership_name = plan.name
    user.membership_expire_at = expire_at
    user.membership_source = "purchase"
    db.commit()
    db.refresh(user)
    return ok({
        "dev_opened": True,  # 标记开发期直接开通
        "membership": _user_dict(user)["membership"],
    })
