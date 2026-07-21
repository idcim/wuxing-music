from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

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


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    admin = db.query(Admin).filter(Admin.username == body.username).first()
    if not admin or not verify_password(body.password, admin.password_hash):
        raise HTTPException(status_code=400, detail="账号或密码错误")
    if not admin.is_active:
        raise HTTPException(status_code=403, detail="账号已禁用")
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
    })
