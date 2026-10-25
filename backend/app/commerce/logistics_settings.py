"""物流账号单独配置：加密存储、空值保留、乐观并发与脱敏审计。"""
import base64
import hashlib
import json
from datetime import datetime

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.models import Setting
from .common import migrated, record

SETTING_KEY = "commerce_logistics_account"


def _cipher():
    material = ("commerce-logistics-account:" + settings.jwt_secret).encode()
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(material).digest()))


def load(db=None):
    row = db.get(Setting, SETTING_KEY) if db is not None else None
    if row is None:
        return dict(enabled=settings.commerce_logistics_provider == "kuaidi100", customer=settings.commerce_logistics_customer,
                    key=settings.commerce_logistics_key, source="environment", revision=0, history=[], error="")
    try:
        value = json.loads(row.value)
        cipher = _cipher()
        return dict(enabled=value["enabled"], customer=cipher.decrypt(value["customer"].encode()).decode(),
                    key=cipher.decrypt(value["key"].encode()).decode(), source="admin",
                    revision=value["revision"], history=value.get("history", []), error="")
    except (InvalidToken, ValueError, KeyError, TypeError, AttributeError):
        # 不回退到环境中的旧密钥；保留修复入口，避免密钥轮换后静默使用其他账号。
        try:
            value = json.loads(row.value)
            revision = value.get("revision", 0)
            history = value.get("history", [])
        except (ValueError, TypeError, AttributeError):
            revision, history = 0, []
        return dict(enabled=False, customer="", key="", source="admin", revision=revision,
                    history=history, error="已保存账号无法读取，请重新填写 Customer 和 Key 后保存")


def configured(db=None):
    value = load(db)
    return bool(value["enabled"] and value["customer"] and value["key"] and not value["error"])


def masked(db):
    value = load(db)
    history = value["history"]
    return dict(enabled=value["enabled"], customer="", key="", customer_set=bool(value["customer"]),
                key_set=bool(value["key"]), source=value["source"], revision=value["revision"],
                configured=bool(value["enabled"] and value["customer"] and value["key"]), error=value["error"],
                last_saved=history[-1] if history else None)


def save(db, body, operator):
    row = db.get(Setting, SETTING_KEY)
    previous = row.value if row is not None else None
    current = load(db)
    if body.revision != current["revision"]:
        raise HTTPException(409, "物流账号已被其他管理员修改，请刷新后重试")
    customer = body.customer or current["customer"]
    key = body.key or current["key"]
    if body.customer and body.customer != current["customer"] and not body.key:
        raise HTTPException(409, "更换 Customer 时，请同时填写该账号对应的 Key")
    if body.enabled and not (customer and key):
        raise HTTPException(409, "请填写快递100提供的 Customer 和 Key，再开启查询")
    cipher = _cipher()
    history = [*current["history"], dict(operator=operator, time=datetime.utcnow().isoformat() + "Z",
               revision=body.revision + 1, enabled=body.enabled,
               customer_changed=bool(body.customer), key_changed=bool(body.key))]
    payload = json.dumps(dict(enabled=body.enabled, customer=cipher.encrypt(customer.encode()).decode(),
                        key=cipher.encrypt(key.encode()).decode(), revision=body.revision + 1, history=history))
    if previous is not None:
        count = db.execute(update(Setting).where(Setting.key == SETTING_KEY, Setting.value == previous).values(value=payload)).rowcount
        if count != 1:
            raise HTTPException(409, "物流账号已被其他管理员修改，请刷新后重试")
    else:
        try:
            with db.begin_nested():
                db.add(Setting(key=SETTING_KEY, value=payload))
                db.flush()
        except IntegrityError as exc:
            raise HTTPException(409, "物流账号已被其他管理员修改，请刷新后重试") from exc
    if migrated(db):
        record(db, "logistics-settings", "logistics_account_saved", history[-1], operator)
    db.commit()
    db.expire_all()
    return masked(db)
