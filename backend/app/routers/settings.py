import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Admin, Setting
from app.schemas import PaySettingIn, ok
from app.security import get_current_admin

router = APIRouter(prefix="/api/admin/settings", tags=["settings"])

PAY_KEY = "pay_config"

# api_key 不回传明文，仅返回是否已配置
SECRET_FIELDS = {"wx_api_key"}


def _get_setting(db: Session, key: str) -> dict:
    row = db.query(Setting).filter(Setting.key == key).first()
    return json.loads(row.value) if row and row.value else {}


def _save_setting(db: Session, key: str, data: dict) -> None:
    row = db.query(Setting).filter(Setting.key == key).first()
    payload = json.dumps(data, ensure_ascii=False)
    if row:
        row.value = payload
    else:
        db.add(Setting(key=key, value=payload))
    db.commit()


@router.get("/pay")
def get_pay(db: Session = Depends(get_db), _: Admin = Depends(get_current_admin)):
    cfg = _get_setting(db, PAY_KEY)
    masked = dict(cfg)
    for f in SECRET_FIELDS:
        masked[f"{f}_set"] = bool(cfg.get(f))
        masked.pop(f, None)
    return ok(masked)


@router.put("/pay")
def update_pay(
    body: PaySettingIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    current = _get_setting(db, PAY_KEY)
    incoming = body.model_dump()
    # 留空的密钥字段保持原值，避免被覆盖清空
    for f in SECRET_FIELDS:
        if not incoming.get(f):
            incoming[f] = current.get(f, "")
    _save_setting(db, PAY_KEY, incoming)
    return ok({"saved": True})
