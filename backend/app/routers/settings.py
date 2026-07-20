import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import storage
from app.database import get_db
from app.models import Admin, Setting
from app.schemas import (
    MpSettingIn,
    OaSettingIn,
    PaySettingIn,
    SiteSettingIn,
    SmsSettingIn,
    StorageSettingIn,
    ok,
)
from app.security import get_current_admin

router = APIRouter(prefix="/api/admin/settings", tags=["settings"])

PAY_KEY = "pay_config"
SITE_KEY = "site_config"
STORAGE_KEY = "storage_config"
MP_KEY = "mp_config"
OA_KEY = "oa_config"
SMS_KEY = "sms_config"

# 敏感字段：不回传明文，仅返回 {field}_set 表示是否已配置
PAY_SECRETS = {"wx_api_key", "wx_key_pem", "wx_cert_pem"}
STORAGE_SECRETS = {"oss_access_key_secret"}
MP_SECRETS = {"app_secret"}
OA_SECRETS = {"app_secret"}
SMS_SECRETS = {"access_key_secret"}


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


def _mask(cfg: dict, secrets: set[str]) -> dict:
    masked = dict(cfg)
    for f in secrets:
        masked[f"{f}_set"] = bool(cfg.get(f))
        masked.pop(f, None)
    return masked


def _merge_secrets(incoming: dict, current: dict, secrets: set[str]) -> dict:
    # 留空的密钥字段保持原值，避免被覆盖清空
    for f in secrets:
        if not incoming.get(f):
            incoming[f] = current.get(f, "")
    return incoming


# ── 支付设置 ──
@router.get("/pay")
def get_pay(db: Session = Depends(get_db), _: Admin = Depends(get_current_admin)):
    return ok(_mask(_get_setting(db, PAY_KEY), PAY_SECRETS))


@router.put("/pay")
def update_pay(
    body: PaySettingIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    current = _get_setting(db, PAY_KEY)
    incoming = _merge_secrets(body.model_dump(), current, PAY_SECRETS)
    _save_setting(db, PAY_KEY, incoming)
    return ok({"saved": True})


# ── 站点设置 ──
@router.get("/site")
def get_site(db: Session = Depends(get_db), _: Admin = Depends(get_current_admin)):
    return ok(_get_setting(db, SITE_KEY))


@router.put("/site")
def update_site(
    body: SiteSettingIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    _save_setting(db, SITE_KEY, body.model_dump())
    return ok({"saved": True})


# ── 存储设置 ──
@router.get("/storage")
def get_storage(db: Session = Depends(get_db), _: Admin = Depends(get_current_admin)):
    return ok(_mask(_get_setting(db, STORAGE_KEY), STORAGE_SECRETS))


@router.put("/storage")
def update_storage(
    body: StorageSettingIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    current = _get_setting(db, STORAGE_KEY)
    incoming = _merge_secrets(body.model_dump(), current, STORAGE_SECRETS)
    _save_setting(db, STORAGE_KEY, incoming)
    return ok({"saved": True})


class MigrateIn(BaseModel):
    rewrite_db: bool = True  # 迁移后是否把数据库里的旧本地 URL 改写为 OSS URL


@router.post("/storage/migrate")
def migrate_storage(
    body: MigrateIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    """把本地 ./uploads 文件迁移到 OSS（需已切换 provider=oss 并保存配置）。
    不删除本地文件；可选把数据库里引用的旧 URL 改写为 OSS URL。"""
    try:
        result = storage.migrate_local_to_oss(db)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    rewritten = 0
    if body.rewrite_db and result.get("mapping"):
        rewritten = storage.rewrite_db_urls(db, result["mapping"])

    return ok({
        "migrated": result["migrated"],
        "failed": result["failed"],
        "db_rewritten": rewritten,
    })


# ── 小程序配置 ──
@router.get("/mp")
def get_mp(db: Session = Depends(get_db), _: Admin = Depends(get_current_admin)):
    return ok(_mask(_get_setting(db, MP_KEY), MP_SECRETS))


@router.put("/mp")
def update_mp(
    body: MpSettingIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    current = _get_setting(db, MP_KEY)
    incoming = _merge_secrets(body.model_dump(), current, MP_SECRETS)
    _save_setting(db, MP_KEY, incoming)
    return ok({"saved": True})


# ── 公众号配置（H5 网页授权 / JSSDK / JSAPI 支付）──
@router.get("/oa")
def get_oa(db: Session = Depends(get_db), _: Admin = Depends(get_current_admin)):
    return ok(_mask(_get_setting(db, OA_KEY), OA_SECRETS))


@router.put("/oa")
def update_oa(
    body: OaSettingIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    current = _get_setting(db, OA_KEY)
    incoming = _merge_secrets(body.model_dump(), current, OA_SECRETS)
    _save_setting(db, OA_KEY, incoming)
    return ok({"saved": True})


# ── 短信配置 ──
@router.get("/sms")
def get_sms(db: Session = Depends(get_db), _: Admin = Depends(get_current_admin)):
    return ok(_mask(_get_setting(db, SMS_KEY), SMS_SECRETS))


@router.put("/sms")
def update_sms(
    body: SmsSettingIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    current = _get_setting(db, SMS_KEY)
    incoming = _merge_secrets(body.model_dump(), current, SMS_SECRETS)
    _save_setting(db, SMS_KEY, incoming)
    return ok({"saved": True})
