"""小程序/APP 端公开接口（用户态）。

真实环境中 wx-login 需用 code 调微信换 openid/unionid；此处接口约定为前端传
已换取的 openid/unionid（或服务端换取后调用），便于联调与 APP 复用。
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from jose import jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User

router = APIRouter(prefix="/api/mp", tags=["miniprogram"])


# ── 用户 JWT（与管理员区分，sub 前缀 user:）──
def create_user_token(user_id: int) -> str:
    from datetime import timedelta
    payload = {
        "sub": f"user:{user_id}",
        "exp": datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


class LoginIn(BaseModel):
    openid: str
    unionid: str = ""
    nickname: str = ""
    avatar: str = ""


def _user_dict(u: User) -> dict:
    return {
        "id": u.id,
        "openid": u.openid,
        "unionid": u.unionid,
        "phone": u.phone,
        "nickname": u.nickname,
        "avatar": u.avatar,
        "element": u.element,
        "membership": {
            "type": u.membership_type,
            "name": u.membership_name,
            "expireAt": u.membership_expire_at.isoformat() if u.membership_expire_at else None,
            "source": u.membership_source,
        },
    }


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
        # 补全 unionid（首次在另一端登录时回填）
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
    return {"code": 0, "data": {"token": token, "user": _user_dict(user)}, "msg": "ok"}


class BindPhoneIn(BaseModel):
    user_id: int
    phone: str


@router.post("/bind-phone")
def bind_phone(body: BindPhoneIn, db: Session = Depends(get_db)):
    """绑定手机号。真实环境应由 getPhoneNumber 的加密数据解出，再调此接口。"""
    user = db.query(User).filter(User.id == body.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if not body.phone or len(body.phone) < 6:
        raise HTTPException(status_code=400, detail="手机号不合法")
    user.phone = body.phone
    db.commit()
    db.refresh(user)
    return {"code": 0, "data": {"phone": user.phone}, "msg": "ok"}
