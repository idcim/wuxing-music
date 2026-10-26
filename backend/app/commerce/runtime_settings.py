"""2.0 渠道配置：数据库优先、加密凭证、脱敏读取与并发保护。"""
import base64
import hashlib
import json
import re
from datetime import datetime
from types import SimpleNamespace
from urllib.parse import urlsplit

from cryptography.fernet import Fernet, InvalidToken
from cryptography.exceptions import UnsupportedAlgorithm
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.models import Setting
from .common import migrated, record

SETTING_KEY = "commerce_runtime_configuration"
# name, label, group, input type, encrypted
FIELDS = [
    ("public_base", "API HTTPS 地址", "实物支付与回调", "text", False),
    ("wxpay_public_key_id", "微信支付平台公钥 ID", "实物支付与回调", "text", False),
    ("wxpay_public_key", "微信支付平台公钥 PEM", "实物支付与回调", "textarea", True),
    ("virtual_approved", "已开通并验证课程数字支付", "课程数字支付", "boolean", False),
    ("virtual_ios_approved", "已开通并验证 iOS 数字支付", "课程数字支付", "boolean", False),
    ("virtual_offer_id", "数字支付 Offer ID", "课程数字支付", "text", False),
    ("virtual_app_key", "数字支付 AppKey", "课程数字支付", "password", True),
    ("push_token", "加密消息推送 Token", "课程数字支付", "password", True),
    ("push_aes_key", "加密消息推送 EncodingAESKey", "课程数字支付", "password", True),
    ("private_endpoint", "私有 OSS Endpoint", "私有课程 OSS", "text", False),
    ("private_bucket", "私有 OSS Bucket", "私有课程 OSS", "text", False),
    ("private_key_id", "私有 OSS AccessKey ID", "私有课程 OSS", "password", True),
    ("private_key_secret", "私有 OSS AccessKey Secret", "私有课程 OSS", "password", True),
    ("shipping_approved", "已开通并验证微信发货管理", "实物发货", "boolean", False),
    ("logistics_carriers", "附加快递编码映射 JSON", "实物发货", "textarea", False),
]
NAMES = {field[0] for field in FIELDS}
SECRETS = {field[0] for field in FIELDS if field[4]}
FLAGS = {field[0] for field in FIELDS if field[3] == "boolean"}


class RuntimeConfigIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, strict=True)
    revision: int = Field(ge=0)
    public_base: str = Field(default="", max_length=512)
    wxpay_public_key_id: str = Field(default="", max_length=128)
    wxpay_public_key: str = Field(default="", max_length=8192)
    virtual_approved: bool = False
    virtual_ios_approved: bool = False
    virtual_offer_id: str = Field(default="", max_length=128)
    virtual_app_key: str = Field(default="", max_length=256)
    push_token: str = Field(default="", max_length=256)
    push_aes_key: str = Field(default="", max_length=128)
    private_endpoint: str = Field(default="", max_length=255)
    private_bucket: str = Field(default="", max_length=63)
    private_key_id: str = Field(default="", max_length=256)
    private_key_secret: str = Field(default="", max_length=256)
    shipping_approved: bool = False
    logistics_carriers: str = Field(default="{}", max_length=8192)
    clear_fields: list[str] = Field(default_factory=list, max_length=7)


def _cipher():
    material = ("commerce-runtime-configuration:" + settings.jwt_secret).encode()
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(material).digest()))


def load(db=None, fallback=None):
    fallback = settings if fallback is None else fallback
    defaults = {name: getattr(fallback, "commerce_" + name, False if name in FLAGS else "") for name in NAMES}
    defaults["logistics_carriers"] = json.dumps(defaults["logistics_carriers"] or {})
    # 复用已验证音乐支付回调的域名；不信任客户端 Host，也不复制商户密钥。
    if db is not None and not defaults["public_base"]:
        from app.routers.mp import _pay_cfg
        parsed = urlsplit(_pay_cfg(db).get("notify_url", ""))
        if parsed.scheme == "https" and parsed.hostname and not parsed.username and not parsed.password:
            defaults["public_base"] = f"https://{parsed.netloc}"
    raw = db.scalar(select(Setting.value).where(Setting.key == SETTING_KEY)) if db is not None else None
    if raw is None:
        return dict(values=defaults, source="environment", revision=0, history=[], error="")
    revision, history, stored = 0, [], {}
    try:
        payload = json.loads(raw)
        revision, history = payload["revision"], payload.get("history", [])
        values = payload["values"]
        stored = values if isinstance(values, dict) else {}
        if type(revision) is not int or revision < 0 or not isinstance(history, list) or set(values) != NAMES:
            raise ValueError()
        cipher = _cipher()
        values = {name: cipher.decrypt(values[name].encode()).decode() if name in SECRETS else values[name] for name in NAMES}
        if any(type(value) is not (bool if name in FLAGS else str) for name, value in values.items()):
            raise ValueError()
        return dict(values=values, source="admin", revision=revision, history=history, error="")
    except (InvalidToken, ValueError, KeyError, TypeError, AttributeError):
        # 可读的桶与 Offer 标识保留用于修复和防换桶；所有凭证及能力标记关闭。
        safe = {name: stored.get(name, "") if name not in SECRETS | FLAGS and type(stored.get(name, "")) is str
                else False if name in FLAGS else "" for name in NAMES}
        return dict(values=safe, source="admin",
                    revision=revision if type(revision) is int and revision >= 0 else 0, history=[],
                    error="已保存配置无法解密或格式无效，请重新填写渠道参数后保存；不会回退使用旧环境配置")


def resolve(db=None, fallback=None):
    value = load(db, fallback)
    values = dict(value["values"])
    if db is not None and not value["error"]:
        from app.storage import get_storage_cfg
        storage = get_storage_cfg(db)
        if storage.get("provider") == "oss":
            values["private_endpoint"] = values["private_endpoint"] or storage.get("oss_endpoint", "")
            if not values["private_key_id"] and not values["private_key_secret"]:
                values["private_key_id"] = storage.get("oss_access_key_id", "")
                values["private_key_secret"] = storage.get("oss_access_key_secret", "")
            # 已公开的音乐桶绝不能作为付费课件桶使用。
            if values["private_bucket"] and values["private_bucket"] == storage.get("oss_bucket"):
                values["private_bucket"] = ""
    try:
        values["logistics_carriers"] = json.loads(values["logistics_carriers"] or "{}")
    except (TypeError, ValueError):
        values["logistics_carriers"] = {}
    return SimpleNamespace(**{"commerce_" + key: item for key, item in values.items()})


def masked(db):
    value = load(db)
    effective = resolve(db)
    return dict(revision=value["revision"], source=value["source"], error=value["error"],
                last_saved=value["history"][-1] if value["history"] else None,
                fields=[dict(name=name, label=label, group=group, type=kind, secret=secret,
                    value="" if secret else value["values"][name], configured=bool(value["values"][name]),
                    inherited=bool(name in ("private_endpoint", "private_key_id", "private_key_secret")
                        and not value["values"][name] and getattr(effective, "commerce_" + name)))
                    for name, label, group, kind, secret in FIELDS])


def validate(values):
    try:
        mapping = json.loads(values["logistics_carriers"] or "{}")
        if not isinstance(mapping, dict) or len(mapping) > 100 or any(
                not isinstance(key, str) or not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", key)
                or not re.fullmatch(r"[a-z0-9]{2,32}", value) for key, value in mapping.items()):
            raise ValueError()
        values["logistics_carriers"] = json.dumps(mapping, sort_keys=True)
    except (TypeError, ValueError):
        raise HTTPException(422, "附加快递编码映射必须是快递公司编码到快递100编码的 JSON 对象") from None
    base = values["public_base"]
    if base:
        try:
            url = urlsplit(base)
        except ValueError:
            raise HTTPException(422, "API HTTPS 地址格式不正确") from None
        if (url.scheme != "https" or not url.hostname or url.username or url.password
                or url.query or url.fragment or url.path not in ("", "/")):
            raise HTTPException(422, "API 地址必须是无路径、账号及查询参数的 HTTPS 域名")
        values["public_base"] = base.rstrip("/")
    endpoint = values["private_endpoint"]
    if endpoint:
        host = endpoint.removeprefix("https://").rstrip("/")
        if not re.fullmatch(r"oss-[a-z0-9-]+\.aliyuncs\.com", host):
            raise HTTPException(422, "请填写阿里云官方 OSS Endpoint，使用 HTTPS")
        values["private_endpoint"] = "https://" + host
    if values["private_bucket"] and not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]", values["private_bucket"]):
        raise HTTPException(422, "OSS Bucket 名称格式不正确")
    if values["wxpay_public_key"]:
        try:
            key = serialization.load_pem_public_key(values["wxpay_public_key"].encode())
            if not isinstance(key, rsa.RSAPublicKey) or key.key_size < 2048:
                raise ValueError()
        except (ValueError, TypeError, UnsupportedAlgorithm):
            raise HTTPException(422, "微信支付平台公钥必须是有效的 RSA 公钥 PEM，至少 2048 位") from None
    if values["push_aes_key"]:
        try:
            if len(values["push_aes_key"]) != 43 or len(base64.b64decode(values["push_aes_key"] + "=", validate=True)) != 32:
                raise ValueError()
        except ValueError:
            raise HTTPException(422, "EncodingAESKey 必须是微信提供的 43 位加密密钥") from None
    if values["virtual_approved"] and not all(values[name] for name in (
            "public_base", "virtual_offer_id", "virtual_app_key", "push_token", "push_aes_key")):
        raise HTTPException(409, "请先补齐数字支付与加密消息推送参数，再启用数字支付标记")
    if values["virtual_ios_approved"] and not values["virtual_approved"]:
        raise HTTPException(409, "启用 iOS 数字支付前请先配置课程数字支付")


def save(db, body, operator):
    previous = db.scalar(select(Setting.value).where(Setting.key == SETTING_KEY))
    current = load(db)
    if body.revision != current["revision"]:
        raise HTTPException(409, "渠道配置已被其他管理员修改，请重新加载后保存")
    values = body.model_dump(exclude={"revision", "clear_fields"})
    if not set(body.clear_fields) <= SECRETS:
        raise HTTPException(422, "只能清除指定的凭证字段")
    for name in SECRETS:
        values[name] = "" if name in body.clear_fields else values[name] or current["values"][name]
    validate(values)
    # 历史课件只记录对象键和版本；换桶会破坏已购课程，凭证可在同桶轮换。
    from .models import MediaAsset, Order
    old = current["values"]
    old_endpoint = old["private_endpoint"].removeprefix("https://").removeprefix("http://").rstrip("/")
    new_endpoint = values["private_endpoint"].removeprefix("https://").rstrip("/")
    changed_store = (old["private_bucket"] and values["private_bucket"] != old["private_bucket"]) or (old_endpoint and new_endpoint != old_endpoint)
    if migrated(db) and changed_store:
        if db.query(MediaAsset).filter((MediaAsset.source_key != "") | (MediaAsset.playback_key != "")).first():
            raise HTTPException(409, "已有课件，不能直接更换或清空 OSS 桶和 Endpoint；请先安排课件迁移")
    if migrated(db) and old["virtual_offer_id"] and values["virtual_offer_id"] != old["virtual_offer_id"]:
        if db.query(Order).filter_by(provider="virtual").first():
            raise HTTPException(409, "已有数字课程订单，不能直接更换 Offer ID")
    changed = sorted(name for name in NAMES if values[name] != old[name])
    event = dict(operator=operator, time=datetime.utcnow().isoformat() + "Z",
                 revision=body.revision + 1, fields_changed=changed)
    cipher = _cipher()
    stored = {name: cipher.encrypt(value.encode()).decode() if name in SECRETS else value for name, value in values.items()}
    history = [*current["history"], event][-100:]
    while True:
        payload = json.dumps(dict(revision=event["revision"], history=history, values=stored), ensure_ascii=False, separators=(",", ":"))
        if len(payload.encode()) <= 60000:
            break
        if len(history) <= 1:
            raise HTTPException(422, "渠道配置内容过大，请减少附加快递映射")
        history = history[1:]  # Setting.value 为 MySQL TEXT；完整业务审计仍在事件表。
    if previous is None:
        try:
            with db.begin_nested():
                db.add(Setting(key=SETTING_KEY, value=payload))
                db.flush()
        except IntegrityError:
            raise HTTPException(409, "渠道配置已被其他管理员修改，请重新加载后保存") from None
    elif db.execute(update(Setting).where(Setting.key == SETTING_KEY, Setting.value == previous).values(value=payload)).rowcount != 1:
        raise HTTPException(409, "渠道配置已被其他管理员修改，请重新加载后保存")
    if migrated(db):
        record(db, "runtime-settings", "channel_configuration_saved", event, operator)
    db.commit()
    db.expire_all()
    return masked(db)
