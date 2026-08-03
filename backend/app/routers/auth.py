from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app import agent_service, captcha, ratelimit
from app.database import get_db
from app.models import Admin, Role
from app.schemas import LoginIn, ok
from app.security import (
    admin_permissions,
    create_access_token,
    get_current_admin,
    verify_password,
)

router = APIRouter(prefix="/api/admin", tags=["admin-auth"])

# 登录失败锁定（口径对齐 mp.py 的手机号密码登录）
LOGIN_FAIL_WINDOW = 600     # 10 分钟
LOGIN_FAIL_MAX = 5          # 同账号连错 5 次
LOGIN_FAIL_IP_MAX = 20      # 同 IP 连错 20 次


@router.get("/captcha")
def get_captcha():
    """发一张登录验证码。免鉴权——登录前就要用。"""
    cid, image = captcha.generate()
    return ok({"id": cid, "image": image})


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    """后台登录：图形验证码 + 失败锁定。

    此前这里既无验证码也无失败限流，密码错了只回 400，可被无限次撞库。
    """
    ip = ratelimit.client_ip(request)
    user_key = f"admin_login_fail:{body.username}"
    ip_key = f"admin_login_fail_ip:{ip}"
    if ratelimit.fail_count(user_key, LOGIN_FAIL_WINDOW) >= LOGIN_FAIL_MAX or (
        ip and ratelimit.fail_count(ip_key, LOGIN_FAIL_WINDOW) >= LOGIN_FAIL_IP_MAX
    ):
        raise HTTPException(status_code=429, detail="尝试过于频繁，请稍后再试")

    def _note_fail() -> None:
        ratelimit.record_fail(user_key)
        if ip:
            ratelimit.record_fail(ip_key)

    # 先验验证码：它是一次性的，验完即作废，前端需换一张再试
    if not captcha.verify(body.captcha_id, body.captcha_code):
        _note_fail()
        raise HTTPException(status_code=400, detail="验证码错误或已失效")

    admin = db.query(Admin).filter(Admin.username == body.username).first()
    if not admin or not verify_password(body.password, admin.password_hash):
        _note_fail()
        raise HTTPException(status_code=400, detail="账号或密码错误")
    if not admin.is_active:
        raise HTTPException(status_code=403, detail="账号已禁用")

    ratelimit.clear_fail(user_key)
    if ip:
        ratelimit.clear_fail(ip_key)
    token = create_access_token(admin.username)
    return ok({"token": token, "nickname": admin.nickname})


@router.get("/me")
def me(
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """后台前端据此显隐菜单与路由（真正的拦截在各接口的 require_perm）。"""
    role = (
        db.query(Role).filter(Role.id == admin.role_id).first()
        if admin.role_id
        else None
    )
    return ok({
        "username": admin.username,
        "nickname": admin.nickname,
        "is_super": bool(admin.is_super),
        "role_name": role.name if role else "",
        "permissions": admin_permissions(admin, db),
        # 可选模块开关：菜单据此显隐。与权限是两回事——
        # 有权限但模块没开，菜单一样不该出现。
        "features": {"agent": agent_service.is_enabled(db)},
    })
