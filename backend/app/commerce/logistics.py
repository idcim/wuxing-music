"""快递100站内轨迹查询；持久限频，不依赖微信插件，不自动确认收货。"""
import hashlib
import json
import re
import uuid
from datetime import datetime, timedelta

import httpx
from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError

from app.config import settings
from .common import record
from .models import LogisticsQuery
from .logistics_settings import load as account_config

ENDPOINT = "https://poll.kuaidi100.com/poll/query.do"
CACHE_INTERVAL = timedelta(minutes=30)
CARRIERS = {"SF": "shunfeng", "STO": "shentong", "ZTO": "zhongtong", "YTO": "yuantong",
            "YD": "yunda", "EMS": "ems", "YZPY": "youzhengguonei", "JD": "jd",
            "JTSD": "jtexpress", "DBL": "debangwuliu", "HTKY": "huitongkuaidi", "ZJS": "zhaijisong"}
STATES = {"0": "运输中", "1": "已揽收", "2": "运输异常", "3": "已签收", "4": "退签",
          "5": "派送中", "6": "退回中", "7": "转投", "8": "清关", "14": "拒签"}


def _row(db, key):
    # 首次创建不锁不存在的行，避免 MySQL 间隙锁竞争；唯一键保证多进程共享限频。
    if db.get(LogisticsQuery, key) is None:
        try:
            with db.begin_nested():
                db.add(LogisticsQuery(key=key))
                db.flush()
        except IntegrityError:
            pass
    return db.query(LogisticsQuery).filter_by(key=key).populate_existing().with_for_update().one()


def _iso(value):
    return value.isoformat() + "Z" if value else None


def _result(row, cached=True):
    data = row.data or {}
    message = data.get("message", "")
    if row.token:
        active = row.next_query_at and datetime.utcnow() < row.next_query_at - CACHE_INTERVAL + timedelta(seconds=30)
        message = "查询处理中，请稍后刷新" if active else "上次查询未完成，请在查询间隔后重试"
    return {"provider": "kuaidi100", "state": data.get("state", ""),
            "state_label": data.get("state_label", "暂无物流轨迹"), "events": data.get("events", []),
            "queried_at": _iso(row.queried_at), "next_query_at": _iso(row.next_query_at),
            "cached": cached, "error": row.error,
            "message": message}


def _normalise(data, carrier, number):
    if not isinstance(data, dict):
        raise ValueError("invalid_response")
    status = str(data.get("status", data.get("returnCode", "")))
    if status == "500":
        return {"state": "", "state_label": "暂无物流轨迹", "events": [], "message": "服务商暂未查到轨迹，请稍后刷新或核对运单。"}
    if status != "200":
        raise ValueError("provider_status_" + (status if status.isdigit() else "unknown"))
    if data.get("com") != carrier or str(data.get("nu", "")).upper() != number.upper():
        raise ValueError("waybill_mismatch")
    if not isinstance(data.get("data"), list):
        raise ValueError("invalid_events")
    events = []
    for item in data["data"][:200]:
        if not isinstance(item, dict) or not isinstance(item.get("context"), str) or not isinstance(item.get("ftime", item.get("time")), str):
            raise ValueError("invalid_events")
        events.append({"time": item.get("ftime") or item["time"], "context": item["context"][:1000]})
        events[-1]["time"] = events[-1]["time"][:80]
    state = str(data.get("state", ""))
    return {"state": state, "state_label": STATES.get(state, "物流状态待核对") if events else "暂无物流轨迹", "events": events}


def trace(db, order, shipment):
    account = account_config(db)
    if not account["enabled"] or not all([account["customer"], account["key"]]) or account["error"]:
        raise HTTPException(409, "快递100物流查询尚未配置，请复制运单号查询或咨询客服")
    from .runtime_settings import resolve
    mapping = {**CARRIERS, **resolve(db, settings).commerce_logistics_carriers}
    carrier = mapping.get(shipment.carrier, mapping.get(shipment.carrier.upper(), shipment.carrier.lower()))
    if not re.fullmatch(r"[a-z0-9]{2,32}", carrier):
        raise HTTPException(409, "快递公司尚未配置查询编码，请联系客服")
    number = shipment.tracking_no
    if not re.fullmatch(r"[A-Za-z0-9-]{6,32}", number):
        raise HTTPException(409, "运单格式暂不支持第三方查询，请联系客服核对")
    param = {"com": carrier, "num": number, "show": "0", "order": "desc"}
    if carrier in ("shunfeng", "shunfengkuaiyun", "zhongtong"):
        phone = order.address.get("phone", "")
        if not phone:
            raise HTTPException(409, "此快递查询需要订单收件电话，请联系客服核对")
        param["phone"] = phone
    encoded = json.dumps(param, ensure_ascii=False, separators=(",", ":"))
    customer = account["customer"]
    fingerprint = hashlib.sha256((customer + encoded).encode()).hexdigest()
    # 账号、运单只共享限频；轨迹按发货记录存储，不能把收件人不同的结果共享给其他订单。
    quota = _row(db, "account:" + hashlib.sha256(customer.encode()).hexdigest())
    waybill = _row(db, "waybill:" + hashlib.sha256((customer + carrier + number.upper()).encode()).hexdigest())
    cache = _row(db, f"shipment:{shipment.id}")
    now = datetime.utcnow()
    if cache.fingerprint != fingerprint:
        cache.fingerprint, cache.data, cache.token, cache.error = fingerprint, {}, "", ""
        cache.queried_at, cache.next_query_at = None, None
    if cache.next_query_at and cache.next_query_at > now:
        result = _result(cache)
        db.commit()
        return result
    if waybill.next_query_at and waybill.next_query_at > now:
        result = _result(cache)
        result.update(next_query_at=_iso(waybill.next_query_at), message="此运单尚在查询间隔内，请稍后刷新")
        db.commit()
        return result
    if quota.next_query_at and quota.next_query_at > now:
        result = _result(cache)
        result["message"] = "物流查询繁忙，请稍后刷新"
        db.commit()
        return result
    token = uuid.uuid4().hex
    cache.fingerprint, cache.token, cache.error = fingerprint, token, ""
    # 生产 MySQL DATETIME 为秒精度，向上取整，不能因截断微秒而提前请求。
    boundary = now.replace(microsecond=0) + timedelta(seconds=1)
    cache.next_query_at = boundary + CACHE_INTERVAL
    waybill.next_query_at = boundary + CACHE_INTERVAL
    quota.next_query_at = boundary + timedelta(seconds=1)
    key = cache.key
    db.commit()  # 网络请求前持久化领取；进程中断或超时也不能重复扣费和超频。
    value, error_code = None, ""
    try:
        sign = hashlib.md5((encoded + account["key"] + customer).encode()).hexdigest().upper()
        response = httpx.post(ENDPOINT, data={"customer": customer, "sign": sign, "param": encoded}, timeout=15)
        response.raise_for_status()
        value = _normalise(response.json(), carrier, number)
    except httpx.HTTPStatusError as exc:
        error_code = f"http_{exc.response.status_code}"
    except httpx.HTTPError:
        error_code = "network_error"
    except (ValueError, KeyError, TypeError) as exc:
        # 只记录白名单状态，JSON 解码异常和第三方原文可能包含号码、签名或密钥。
        code = str(exc)
        error_code = code if code in {"waybill_mismatch", "invalid_response", "invalid_events", "provider_status_unknown"} or re.fullmatch(r"provider_status_\d{3}", code) else "invalid_response"
    error = "物流查询暂不可用，请稍后刷新或联系客服" if error_code else ""
    changes = {"token": "", "error": error}
    if value is not None:
        changes.update(data=value, queried_at=datetime.utcnow())
    updated = db.execute(update(LogisticsQuery).where(LogisticsQuery.key == key, LogisticsQuery.token == token)
                         .values(**changes)).rowcount
    if updated:
        record(db, order.order_no, "logistics_query_failed" if error else "logistics_queried",
               {"provider": "kuaidi100", **({"reason": error_code} if error_code else {})})
    db.commit()
    cache = db.query(LogisticsQuery).filter_by(key=key).populate_existing().one()
    return _result(cache, cached=not bool(updated))
