"""后台管理员与角色权限管理（/api/admin/admins、/roles、/permissions）。

全部端点要求 admins:manage 权限——默认只有 is_super 的管理员拥有它。
自锁防护是本模块的重点：任何操作都不能让系统失去可用的超级管理员。
"""

import json

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Admin, Role
from app.permissions import ALL_PERMISSIONS, PERMISSION_GROUPS, PERMISSION_SET
from app.schemas import ok
from app.security import hash_password, require_perm

router = APIRouter(prefix="/api/admin", tags=["admins-roles"])

MIN_PASSWORD_LEN = 6


def _role_dict(r: Role, in_use: int = 0) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "remark": r.remark,
        "permissions": _load_perms(r.permissions),
        "is_builtin": bool(r.is_builtin),
        "admin_count": in_use,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def _load_perms(raw: str | None) -> list[str]:
    try:
        perms = json.loads(raw or "[]")
    except ValueError:
        return []
    return [p for p in perms if isinstance(p, str)]


def _admin_dict(a: Admin, role_names: dict[int, str]) -> dict:
    """出参永不包含 password_hash。"""
    return {
        "id": a.id,
        "username": a.username,
        "nickname": a.nickname,
        "is_active": bool(a.is_active),
        "is_super": bool(a.is_super),
        "role_id": a.role_id,
        "role_name": role_names.get(a.role_id or 0, ""),
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def _role_name_map(db: Session) -> dict[int, str]:
    return {r.id: r.name for r in db.query(Role).all()}


def _count_supers(db: Session, exclude_id: int | None = None) -> int:
    q = db.query(Admin).filter(Admin.is_super.is_(True), Admin.is_active.is_(True))
    if exclude_id is not None:
        q = q.filter(Admin.id != exclude_id)
    return q.count()


def _clean_perms(perms: list[str] | None) -> list[str]:
    """只保留已定义的权限点，顺序按 ALL_PERMISSIONS 归一，便于比对。"""
    given = {p for p in (perms or []) if p in PERMISSION_SET}
    return [p for p in ALL_PERMISSIONS if p in given]


# ── 管理员 ──────────────────────────────────────────────


@router.get("/admins")
def list_admins(
    keyword: str | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("admins:manage")),
):
    q = db.query(Admin)
    if keyword:
        q = q.filter(Admin.username.contains(keyword))
    total = q.count()
    rows = q.order_by(Admin.id.asc()).offset((page - 1) * size).limit(size).all()
    names = _role_name_map(db)
    return ok({"total": total, "items": [_admin_dict(a, names) for a in rows]})


class AdminCreateIn(BaseModel):
    username: str
    password: str
    nickname: str = "管理员"
    role_id: int | None = None
    is_super: bool = False


@router.post("/admins")
def create_admin(
    body: AdminCreateIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("admins:manage")),
):
    username = body.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="账号不能为空")
    if len(body.password) < MIN_PASSWORD_LEN:
        raise HTTPException(status_code=400, detail=f"密码至少 {MIN_PASSWORD_LEN} 位")
    if db.query(Admin).filter(Admin.username == username).first():
        raise HTTPException(status_code=400, detail=f"账号「{username}」已存在")
    if body.role_id and not db.query(Role).filter(Role.id == body.role_id).first():
        raise HTTPException(status_code=404, detail="角色不存在")

    admin = Admin(
        username=username,
        password_hash=hash_password(body.password),
        nickname=body.nickname.strip() or "管理员",
        role_id=body.role_id,
        is_super=body.is_super,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return ok(_admin_dict(admin, _role_name_map(db)))


class AdminUpdateIn(BaseModel):
    nickname: str | None = None
    role_id: int | None = None
    is_super: bool | None = None
    is_active: bool | None = None


@router.put("/admins/{admin_id}")
def update_admin(
    admin_id: int,
    body: AdminUpdateIn,
    db: Session = Depends(get_db),
    me: Admin = Depends(require_perm("admins:manage")),
):
    target = db.query(Admin).filter(Admin.id == admin_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="管理员不存在")

    is_self = target.id == me.id

    if body.is_active is not None and not body.is_active:
        if is_self:
            raise HTTPException(status_code=400, detail="不能停用自己的账号")
        if target.is_super and _count_supers(db, exclude_id=target.id) == 0:
            raise HTTPException(status_code=400, detail="至少保留一个可用的超级管理员")

    if body.is_super is not None and not body.is_super:
        if is_self:
            raise HTTPException(status_code=400, detail="不能取消自己的超级管理员身份")
        if target.is_super and _count_supers(db, exclude_id=target.id) == 0:
            raise HTTPException(status_code=400, detail="至少保留一个可用的超级管理员")

    if body.role_id is not None and body.role_id:
        if not db.query(Role).filter(Role.id == body.role_id).first():
            raise HTTPException(status_code=404, detail="角色不存在")

    if body.nickname is not None:
        target.nickname = body.nickname.strip() or "管理员"
    if body.role_id is not None:
        target.role_id = body.role_id or None
    if body.is_super is not None:
        target.is_super = body.is_super
    if body.is_active is not None:
        target.is_active = body.is_active

    db.commit()
    db.refresh(target)
    return ok(_admin_dict(target, _role_name_map(db)))


class PasswordIn(BaseModel):
    password: str


@router.post("/admins/{admin_id}/password")
def reset_password(
    admin_id: int,
    body: PasswordIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("admins:manage")),
):
    target = db.query(Admin).filter(Admin.id == admin_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="管理员不存在")
    if len(body.password) < MIN_PASSWORD_LEN:
        raise HTTPException(status_code=400, detail=f"密码至少 {MIN_PASSWORD_LEN} 位")
    target.password_hash = hash_password(body.password)
    db.commit()
    return ok({"id": target.id})


@router.delete("/admins/{admin_id}")
def delete_admin(
    admin_id: int,
    db: Session = Depends(get_db),
    me: Admin = Depends(require_perm("admins:manage")),
):
    target = db.query(Admin).filter(Admin.id == admin_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="管理员不存在")
    if target.id == me.id:
        raise HTTPException(status_code=400, detail="不能删除自己的账号")
    if target.is_super and _count_supers(db, exclude_id=target.id) == 0:
        raise HTTPException(status_code=400, detail="至少保留一个可用的超级管理员")
    db.delete(target)
    db.commit()
    return ok({"id": admin_id})


# ── 角色 ────────────────────────────────────────────────


@router.get("/roles")
def list_roles(
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("admins:manage")),
):
    roles = db.query(Role).order_by(Role.id.asc()).all()
    counts = {
        r.id: db.query(Admin).filter(Admin.role_id == r.id).count() for r in roles
    }
    return ok([_role_dict(r, counts.get(r.id, 0)) for r in roles])


class RoleIn(BaseModel):
    id: int | None = None
    name: str
    remark: str = ""
    permissions: list[str] = []


@router.post("/roles")
def upsert_role(
    body: RoleIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("admins:manage")),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="角色名不能为空")

    dup = db.query(Role).filter(Role.name == name)
    if body.id:
        dup = dup.filter(Role.id != body.id)
    if dup.first():
        raise HTTPException(status_code=400, detail=f"角色「{name}」已存在")

    perms = _clean_perms(body.permissions)

    if body.id:
        role = db.query(Role).filter(Role.id == body.id).first()
        if not role:
            raise HTTPException(status_code=404, detail="角色不存在")
        if role.is_builtin:
            raise HTTPException(status_code=400, detail="内置角色不可修改")
        role.name = name
        role.remark = body.remark
        role.permissions = json.dumps(perms, ensure_ascii=False)
    else:
        role = Role(
            name=name,
            remark=body.remark,
            permissions=json.dumps(perms, ensure_ascii=False),
        )
        db.add(role)

    db.commit()
    db.refresh(role)
    return ok(_role_dict(role))


@router.delete("/roles/{role_id}")
def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("admins:manage")),
):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    if role.is_builtin:
        raise HTTPException(status_code=400, detail="内置角色不可删除")
    used = db.query(Admin).filter(Admin.role_id == role_id).count()
    if used:
        raise HTTPException(status_code=400, detail=f"仍有 {used} 个管理员在使用该角色")
    db.delete(role)
    db.commit()
    return ok({"id": role_id})


# ── 权限点清单 ──────────────────────────────────────────


@router.get("/permissions")
def list_permissions(_: Admin = Depends(require_perm("admins:manage"))):
    return ok({"groups": PERMISSION_GROUPS, "all": ALL_PERMISSIONS})
