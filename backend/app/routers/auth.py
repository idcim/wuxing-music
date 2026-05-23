from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Admin
from app.schemas import LoginIn, ok
from app.security import create_access_token, get_current_admin, verify_password

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
def me(admin: Admin = Depends(get_current_admin)):
    return ok({"username": admin.username, "nickname": admin.nickname})
