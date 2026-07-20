"""微信支付 v3（小程序 JSAPI）最小实现：统一下单 + 回调解密。

依赖商户 APIv3 配置（后台「支付设置」pay_config）：
  wx_app_id      小程序 AppID
  wx_mch_id      商户号
  wx_api_key     APIv3 密钥（32 位，用于回调 AEAD 解密）
  wx_cert_serial 商户证书序列号
  wx_key_pem     商户私钥 apiclient_key.pem 文本（用于请求签名）
  notify_url     支付结果通知地址（https，公网可达）

签名/验签用 cryptography（随 python-jose[cryptography] 已安装）。
注意：回调验签理论上应校验微信平台证书；此处做了 AEAD 解密 + 金额/状态校验，
平台证书验签留作 TODO（需定期下载平台证书并缓存）。
"""
import base64
import json
import time
import uuid
from typing import Optional

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

WXPAY_BASE = "https://api.mch.weixin.qq.com"


class WxPayError(Exception):
    pass


def _require(cfg: dict, *keys: str) -> None:
    missing = [k for k in keys if not cfg.get(k)]
    if missing:
        raise WxPayError(f"支付配置缺失：{', '.join(missing)}")


def _load_private_key(pem_text: str):
    try:
        return serialization.load_pem_private_key(pem_text.encode("utf-8"), password=None)
    except Exception as e:  # noqa: BLE001
        raise WxPayError(f"商户私钥解析失败：{e}")


def _rsa_sign(private_key, message: str) -> str:
    signature = private_key.sign(
        message.encode("utf-8"), padding.PKCS1v15(), hashes.SHA256()
    )
    return base64.b64encode(signature).decode("utf-8")


def _authorization(cfg: dict, method: str, url_path: str, body: str) -> str:
    """构造 Authorization 头（WECHATPAY2-SHA256-RSA2048）。"""
    private_key = _load_private_key(cfg["wx_key_pem"])
    nonce = uuid.uuid4().hex.upper()
    ts = str(int(time.time()))
    message = f"{method}\n{url_path}\n{ts}\n{nonce}\n{body}\n"
    signature = _rsa_sign(private_key, message)
    return (
        f'WECHATPAY2-SHA256-RSA2048 '
        f'mchid="{cfg["wx_mch_id"]}",'
        f'nonce_str="{nonce}",'
        f'signature="{signature}",'
        f'timestamp="{ts}",'
        f'serial_no="{cfg["wx_cert_serial"]}"'
    )


def create_jsapi_order(
    cfg: dict, *, openid: str, order_no: str, amount_fen: int, description: str,
    app_id: Optional[str] = None,
) -> dict:
    """调用 JSAPI 下单，返回前端 wx.requestPayment 所需参数（已二次签名）。
    app_id 可选：H5 公众号支付传公众号 AppID；缺省用 pay_config 的小程序 wx_app_id。"""
    _require(cfg, "wx_app_id", "wx_mch_id", "wx_key_pem", "wx_cert_serial", "notify_url")

    appid = app_id or cfg["wx_app_id"]
    url_path = "/v3/pay/transactions/jsapi"
    payload = {
        "appid": appid,
        "mchid": cfg["wx_mch_id"],
        "description": description,
        "out_trade_no": order_no,
        "notify_url": cfg["notify_url"],
        "amount": {"total": amount_fen, "currency": "CNY"},
        "payer": {"openid": openid},
    }
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    headers = {
        "Authorization": _authorization(cfg, "POST", url_path, body),
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    try:
        resp = httpx.post(f"{WXPAY_BASE}{url_path}", content=body.encode("utf-8"), headers=headers, timeout=15)
    except httpx.HTTPError as e:
        raise WxPayError(f"调用微信下单失败：{e}")
    if resp.status_code != 200:
        raise WxPayError(f"微信下单返回 {resp.status_code}：{resp.text}")

    prepay_id = resp.json().get("prepay_id")
    if not prepay_id:
        raise WxPayError(f"微信下单未返回 prepay_id：{resp.text}")

    return _build_pay_params(cfg, prepay_id, app_id=appid)


def _build_pay_params(cfg: dict, prepay_id: str, app_id: Optional[str] = None) -> dict:
    """对 prepay_id 二次签名，生成 requestPayment 参数。
    app_id 缺省用 pay_config 的小程序 wx_app_id（H5 支付传公众号 AppID）。"""
    private_key = _load_private_key(cfg["wx_key_pem"])
    appid = app_id or cfg["wx_app_id"]
    ts = str(int(time.time()))
    nonce = uuid.uuid4().hex.upper()
    pkg = f"prepay_id={prepay_id}"
    message = f"{appid}\n{ts}\n{nonce}\n{pkg}\n"
    pay_sign = _rsa_sign(private_key, message)
    return {
        "timeStamp": ts,
        "nonceStr": nonce,
        "package": pkg,
        "signType": "RSA",
        "paySign": pay_sign,
    }


def refund(
    cfg: dict,
    *,
    transaction_id: str,
    out_refund_no: str,
    refund_fen: int,
    total_fen: int,
    reason: str = "",
) -> dict:
    """申请退款（v3 /refund/domestic/refunds）。
    refund_fen 退款金额，total_fen 原订单金额（分）。成功返回微信响应 dict。"""
    _require(cfg, "wx_mch_id", "wx_key_pem", "wx_cert_serial")
    if not transaction_id:
        raise WxPayError("缺少微信支付单号(transaction_id)，无法退款")

    url_path = "/v3/refund/domestic/refunds"
    payload = {
        "transaction_id": transaction_id,
        "out_refund_no": out_refund_no,
        "amount": {"refund": refund_fen, "total": total_fen, "currency": "CNY"},
    }
    if reason:
        payload["reason"] = reason
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    headers = {
        "Authorization": _authorization(cfg, "POST", url_path, body),
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    try:
        resp = httpx.post(
            f"{WXPAY_BASE}{url_path}", content=body.encode("utf-8"), headers=headers, timeout=15
        )
    except httpx.HTTPError as e:
        raise WxPayError(f"调用微信退款失败：{e}")
    if resp.status_code not in (200, 201):
        raise WxPayError(f"微信退款返回 {resp.status_code}：{resp.text}")
    return resp.json()


def decrypt_callback_resource(api_v3_key: str, resource: dict) -> dict:
    """AEAD_AES_256_GCM 解密回调 resource，返回明文 dict。"""
    if not api_v3_key:
        raise WxPayError("缺少 APIv3 密钥，无法解密回调")
    nonce = resource["nonce"].encode("utf-8")
    associated = (resource.get("associated_data") or "").encode("utf-8")
    ciphertext = base64.b64decode(resource["ciphertext"])
    aesgcm = AESGCM(api_v3_key.encode("utf-8"))
    plaintext = aesgcm.decrypt(nonce, ciphertext, associated)
    return json.loads(plaintext)
