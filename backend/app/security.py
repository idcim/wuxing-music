import json
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Admin, Role
from app.permissions import ALL_PERMISSIONS

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/admin/login")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def get_current_admin(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Admin:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="登录态无效或已过期",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        username = payload.get("sub")
        if username is None:
            raise credentials_exc
    except JWTError:
        raise credentials_exc

    admin = db.query(Admin).filter(Admin.username == username).first()
    if admin is None or not admin.is_active:
        raise credentials_exc
    return admin


def admin_permissions(admin: Admin, db: Session) -> list[str]:
    """该管理员实际拥有的权限点。超管恒为全量。"""
    if admin.is_super:
        return list(ALL_PERMISSIONS)
    if not admin.role_id:
        return []
    role = db.query(Role).filter(Role.id == admin.role_id).first()
    if not role:
        return []
    try:
        perms = json.loads(role.permissions or "[]")
    except ValueError:
        return []
    return [p for p in perms if isinstance(p, str)]


def require_perm(*perms: str):
    """生成一个「需要任一权限点」的依赖，替代裸的 get_current_admin。

    用法： _: Admin = Depends(require_perm("tracks:edit"))
    超管直接放行；其余按角色权限判定，缺权限返回 403。
    """

    def dep(
        admin: Admin = Depends(get_current_admin),
        db: Session = Depends(get_db),
    ) -> Admin:
        if admin.is_super:
            return admin
        owned = set(admin_permissions(admin, db))
        if not any(p in owned for p in perms):
            raise HTTPException(status_code=403, detail="无权限执行该操作")
        return admin

    return dep
