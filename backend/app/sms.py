"""短信验证码抽象层：阿里云 dysmsapi（可扩展其他 provider）。

后台「短信设置」(sms_config) 决定 provider 与密钥：
  {provider, access_key_id, access_key_secret, sign_name, template_code, enabled}
  - enabled 为假或缺配置：走开发直通（日志打印验证码，不真正发送）
  - enabled 且配置齐全：调用 provider 真实发送

对外统一接口：
  send_code(db, phone, code) -> {"sent": bool, "dev": bool, "code"?: str}
    dev=True 表示未真实发送（联调用），此时附带明文 code。
  gen_code() -> str  生成 6 位数字验证码（用 secrets，避免可预测）。
"""
import base64
import hashlib
import hmac
import json
import logging
import secrets
import uuid
from datetime import datetime
from urllib.parse import quote

from sqlalchemy.orm import Session

from app.models import Setting

logger = logging.getLogger("uvicorn.error")

SMS_KEY = "sms_config"


def get_sms_cfg(db: Session) -> dict:
    row = db.query(Setting).filter(Setting.key == SMS_KEY).first()
    return json.loads(row.value) if row and row.value else {}


def gen_code(length: int = 6) -> str:
    """生成数字验证码；用 secrets 保证不可预测（勿用 random）。"""
    return "".join(secrets.choice("0123456789") for _ in range(length))


def is_configured(db: Session) -> bool:
    """短信服务是否已配置且启用（决定生产能否真正下发短信）。
    未配置时 send_code 会走开发直通（明文回传），生产应据此拒绝。"""
    cfg = get_sms_cfg(db)
    configured = all(
        cfg.get(k)
        for k in ("access_key_id", "access_key_secret", "sign_name", "template_code")
    )
    return bool(cfg.get("enabled") and configured)


def send_code(db: Session, phone: str, code: str) -> dict:
    """发送验证码。未启用/缺配置时走开发直通（返回 dev=True + 明文 code）。"""
    cfg = get_sms_cfg(db)
    provider = cfg.get("provider", "aliyun")
    configured = all(
        cfg.get(k)
        for k in ("access_key_id", "access_key_secret", "sign_name", "template_code")
    )

    if not cfg.get("enabled") or not configured:
        # 开发兜底：不真正发送，日志打印便于联调
        logger.info("【短信·DEV】%s 验证码：%s（未配置短信服务，走开发直通）", phone, code)
        return {"sent": True, "dev": True, "code": code}

    if provider == "aliyun":
        _send_aliyun(cfg, phone, code)
        return {"sent": True, "dev": False}

    # 其他服务商暂未实现
    raise RuntimeError(f"暂不支持的短信服务商：{provider}")


# ── 阿里云 dysmsapi（RPC 风格签名 HMAC-SHA1）──
def _percent_encode(s: str) -> str:
    """阿里云要求的百分号编码：未保留字符 A-Za-z0-9-_.~ 不编码，其余大写 %XX。"""
    return quote(s, safe="~")


def _sign_aliyun(params: dict, secret: str) -> str:
    """按阿里云 RPC 规范对参数排序、规范化后 HMAC-SHA1 签名，返回 Base64。"""
    canonical = "&".join(
        f"{_percent_encode(k)}={_percent_encode(v)}" for k, v in sorted(params.items())
    )
    string_to_sign = "GET&" + _percent_encode("/") + "&" + _percent_encode(canonical)
    digest = hmac.new(
        (secret + "&").encode("utf-8"), string_to_sign.encode("utf-8"), hashlib.sha1
    ).digest()
    return base64.b64encode(digest).decode("utf-8")


def _send_aliyun(cfg: dict, phone: str, code: str) -> None:
    """调用阿里云短信 SendSms 接口；失败抛 RuntimeError（调用方转 HTTP 错误）。
    模板变量名约定为 code，即模板内容形如「验证码 ${code}，...」。"""
    import httpx

    params = {
        "AccessKeyId": cfg["access_key_id"],
        "Action": "SendSms",
        "Format": "JSON",
        "PhoneNumbers": phone,
        "RegionId": "cn-hangzhou",
        "SignName": cfg["sign_name"],
        "SignatureMethod": "HMAC-SHA1",
        "SignatureNonce": uuid.uuid4().hex,
        "SignatureVersion": "1.0",
        "TemplateCode": cfg["template_code"],
        "TemplateParam": json.dumps({"code": code}, ensure_ascii=False),
        "Timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "Version": "2017-05-25",
    }
    params["Signature"] = _sign_aliyun(params, cfg["access_key_secret"])

    try:
        resp = httpx.get("https://dysmsapi.aliyuncs.com/", params=params, timeout=10)
        data = resp.json()
    except Exception as e:  # noqa: BLE001
        raise RuntimeError(f"短信发送失败：{e}")

    if data.get("Code") != "OK":
        raise RuntimeError(f"短信发送失败：{data.get('Message') or data}")
