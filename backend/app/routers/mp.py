"""小程序/APP 端公开接口（用户态）。

真实环境中 wx-login 需用 code 调微信换 openid/unionid；此处接口约定为前端传
已换取的 openid/unionid（或服务端换取后调用），便于联调与 APP 复用。
鉴权：登录返回用户 JWT（sub=user:<id>），后续接口用 Bearer 携带。
"""
import json
import logging
import re
import uuid
from datetime import date, datetime, timedelta
from typing import NoReturn

from fastapi import APIRouter, Depends, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import agent_service, ratelimit, sms, storage, wxpay
from app.config import settings
from app.database import get_db
from app.lunar import lunar_info
from app.models import (
    Agent,
    Cdkey,
    CdkeyRedeemLog,
    Commission,
    Element,
    Order,
    PlayHistory,
    Plan,
    Setting,
    SmsCode,
    Track,
    User,
    Withdrawal,
)
from app.security import hash_password, verify_password

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/mp", tags=["miniprogram"])


def ok(data=None, msg="ok"):
    return {"code": 0, "data": data, "msg": msg}


# 大陆手机号：1 开头 11 位
PHONE_RE = re.compile(r"^1\d{10}$")


# 取客户端 IP 已提到 ratelimit（后台登录限流同样要用），此处保留别名不改调用点
_client_ip = ratelimit.client_ip


# ── 用户 JWT（与管理员区分，sub 前缀 user:）──
def create_user_token(user_id: int) -> str:
    payload = {
        "sub": f"user:{user_id}",
        "exp": datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def get_current_user(
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> User:
    exc = HTTPException(status_code=401, detail="登录态无效或已过期")
    if not authorization.startswith("Bearer "):
        raise exc
    token = authorization[7:]
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        sub = payload.get("sub", "")
        if not sub.startswith("user:"):
            raise exc
        uid = int(sub.split(":", 1)[1])
    except (JWTError, ValueError):
        raise exc
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise exc
    return user


def _is_premium(u: User) -> bool:
    return (
        u.membership_type != "free"
        and u.membership_expire_at is not None
        and u.membership_expire_at > datetime.utcnow()
    )


def _user_dict(u: User) -> dict:
    return {
        "id": u.id,
        "openid": u.openid,
        "unionid": u.unionid,
        "phone": u.phone,
        # 只回布尔，不回哈希：前端据此显示「登录密码 已设置/未设置」
        "hasPassword": bool(u.password_hash),
        "nickname": u.nickname,
        "avatar": u.avatar,
        "element": u.element,
        "elementScores": json.loads(u.element_scores or "{}"),
        "quizCompletedAt": u.quiz_completed_at.isoformat() if u.quiz_completed_at else None,
        "birthday": u.birthday.isoformat() if u.birthday else None,
        "birthHour": u.birth_hour,
        # 农历/生肖/本命五行由后端算好一起下发（前端不引农历库，见 app/lunar.py 开头注释）。
        # 注意：这些字段必须出现在本函数里——前端 initFromCache 会用 fetchProfile 的结果
        # 整体覆盖本地缓存，这里不返回的字段会在下次启动时被抹掉。
        "lunar": lunar_info(u.birthday, u.birth_hour),
        "isPremium": _is_premium(u),
        "membership": {
            "type": u.membership_type,
            "name": u.membership_name,
            "expireAt": u.membership_expire_at.isoformat() if u.membership_expire_at else None,
            "source": u.membership_source,
        },
        "createdAt": u.created_at.isoformat() if u.created_at else None,
    }


# ── 登录 ──
class LoginIn(BaseModel):
    code: str = ""          # wx.login() 的临时凭证，后端用它换稳定 openid
    openid: str = ""        # 兜底：游客态/无小程序配置时前端直传的稳定标识
    unionid: str = ""
    nickname: str = ""
    avatar: str = ""


def _default_nickname() -> str:
    """未设置昵称的新用户给一个带随机后缀的默认名，便于后台区分。
    形如「律音用户·A3K9」；字符集去除易混的 0/O/1/I。"""
    import random
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    suffix = "".join(random.choice(alphabet) for _ in range(4))
    return f"律音用户·{suffix}"


def _jscode2session(db: Session, code: str) -> dict:
    """用 code + 小程序 AppID/Secret 调微信换取 openid/unionid。
    返回 {"openid":..., "unionid":...}；未配置或失败返回 {}。"""
    row = db.query(Setting).filter(Setting.key == "mp_config").first()
    cfg = json.loads(row.value) if row and row.value else {}
    app_id = cfg.get("app_id")
    app_secret = cfg.get("app_secret")
    if not (app_id and app_secret and code):
        return {}
    try:
        import httpx
        resp = httpx.get(
            "https://api.weixin.qq.com/sns/jscode2session",
            params={
                "appid": app_id,
                "secret": app_secret,
                "js_code": code,
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
        data = resp.json()
    except Exception as e:  # noqa: BLE001
        logger.warning("jscode2session 调用失败：%s", e)
        return {}
    if data.get("openid"):
        return {"openid": data["openid"], "unionid": data.get("unionid", "")}
    logger.warning("jscode2session 返回异常：%s", data)
    return {}


@router.post("/login")
def mp_login(body: LoginIn, db: Session = Depends(get_db)):
    """登录：已配置小程序密钥时必须用 code 换取真实 openid（绝不接受前端直传 openid，
    否则可冒充任意用户顶号）；仅未配置时回退前端游客 openid（dev）。识别优先级：unionid > openid。"""
    row = db.query(Setting).filter(Setting.key == "mp_config").first()
    mp_cfg = json.loads(row.value) if row and row.value else {}
    configured = bool(mp_cfg.get("app_id") and mp_cfg.get("app_secret"))

    unionid = body.unionid
    if configured:
        # 已配置：必须用真实 code 换 openid，忽略前端直传（防顶号）
        if not body.code:
            raise HTTPException(status_code=400, detail="缺少登录 code")
        sess = _jscode2session(db, body.code)
        openid = sess.get("openid", "")
        unionid = sess.get("unionid") or unionid
        if not openid:
            raise HTTPException(status_code=400, detail="微信登录失败，请重试")
    else:
        # 未配置小程序密钥：仅开发态允许前端稳定游客标识兜底；生产拒绝
        if not settings.debug:
            raise HTTPException(status_code=503, detail="登录服务未配置")
        openid = (body.openid or "").strip()

    # 合成前缀 openid 属手机号等其它登录路径的用户（phone:<手机号> 可猜），
    # 不可经本端点的 openid 直信路径换取，防止顶号。
    if not openid or openid.startswith("phone:"):
        raise HTTPException(status_code=400, detail="登录凭证无效")

    user = None
    if unionid:
        user = db.query(User).filter(User.unionid == unionid).first()
    if not user:
        user = db.query(User).filter(User.openid == openid).first()

    if not user:
        user = User(
            openid=openid,
            unionid=unionid,
            nickname=body.nickname or _default_nickname(),
            avatar=body.avatar,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        changed = False
        if unionid and not user.unionid:
            user.unionid = unionid
            changed = True
        if body.avatar and not user.avatar:
            user.avatar = body.avatar
            changed = True
        if changed:
            db.commit()
            db.refresh(user)

    token = create_user_token(user.id)
    return ok({"token": token, "user": _user_dict(user)})


# ── 手机号登录（短信验证码 / 密码）──
class SmsSendIn(BaseModel):
    phone: str
    scene: str = "login"


# 短信发送限频阈值
SMS_IP_HOURLY = 20        # 同 IP 每小时最多发起（防批量盗刷不同号码）
SMS_PHONE_DAILY = 10      # 同手机号每日最多发送（防对单号短信轰炸）
# 允许的验证码场景（与前端 SmsScene 对齐）：未知场景一律拒绝，
# 免得被用来凭空消耗短信额度、或绕开某个场景的额外校验。
SMS_SCENES = {"login", "bind", "reset"}


@router.post("/sms/send")
def mp_sms_send(body: SmsSendIn, request: Request, db: Session = Depends(get_db)):
    """发送短信验证码。防刷多重把关：手机号格式 + 同号 60 秒限频 + 同号每日上限
    + 同 IP 每小时上限。短信未配置时：开发态走直通并回传 devCode 便于联调；
    生产态直接拒绝（避免验证码形同虚设）。"""
    phone = (body.phone or "").strip()
    if not PHONE_RE.match(phone):
        raise HTTPException(status_code=400, detail="手机号格式不正确")
    scene = (body.scene or "login").strip()
    if scene not in SMS_SCENES:
        raise HTTPException(status_code=400, detail="不支持的验证码场景")

    # 生产未配短信：拒绝而非明文回传（dev fail-open 仅限开发态）
    if not settings.debug and not sms.is_configured(db):
        logger.error("短信服务未配置，生产环境拒绝下发验证码")
        raise HTTPException(status_code=500, detail="短信服务未配置")

    # 同 IP 每小时上限
    ip = _client_ip(request)
    if ip and not ratelimit.check_and_record(f"sms_ip:{ip}", SMS_IP_HOURLY, 3600):
        raise HTTPException(status_code=429, detail="操作过于频繁，请稍后再试")

    now = datetime.utcnow()
    # 同手机号 60 秒限频
    last = (
        db.query(SmsCode)
        .filter(SmsCode.phone == phone)
        .order_by(SmsCode.id.desc())
        .first()
    )
    if last and last.created_at and (now - last.created_at) < timedelta(seconds=60):
        raise HTTPException(status_code=429, detail="发送过于频繁，请稍后再试")

    # 同手机号每日上限
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    sent_today = (
        db.query(SmsCode)
        .filter(SmsCode.phone == phone, SmsCode.created_at >= day_start)
        .count()
    )
    if sent_today >= SMS_PHONE_DAILY:
        raise HTTPException(status_code=429, detail="今日发送次数已达上限，请明日再试")

    code = sms.gen_code()
    db.add(SmsCode(phone=phone, code=code, scene=scene, expire_at=now + timedelta(minutes=10)))
    db.commit()

    result = sms.send_code(db, phone, code)
    data: dict = {"sent": True}
    if result.get("dev") and settings.debug:
        # 仅开发直通且开发态才回传，便于无短信通道联调；生产不返回
        data["devCode"] = result.get("code", code)
    return ok(data)


def _consume_sms_code(db: Session, phone: str, code: str, scene: str) -> None:
    """校验并核销一枚短信验证码；不通过直接抛 400。

    登录（scene=login）与绑定手机号（scene=bind）共用，保证两处的
    过期判定与失败计数（达 5 次作废该码，防暴力猜测）行为一致。
    """
    now = datetime.utcnow()
    row = (
        db.query(SmsCode)
        .filter(
            SmsCode.phone == phone,
            SmsCode.scene == scene,
            SmsCode.used == False,  # noqa: E712
        )
        .order_by(SmsCode.id.desc())
        .first()
    )
    if not row:
        raise HTTPException(status_code=400, detail="验证码错误")
    if row.expire_at and row.expire_at < now:
        raise HTTPException(status_code=400, detail="验证码已过期")
    if row.code != code:
        row.attempts += 1
        if row.attempts >= 5:
            row.used = True
        db.commit()
        raise HTTPException(status_code=400, detail="验证码错误")
    row.used = True
    db.commit()


class PhoneLoginIn(BaseModel):
    phone: str
    code: str


@router.post("/login/phone")
def mp_login_phone(body: PhoneLoginIn, db: Session = Depends(get_db)):
    """短信验证码登录：校验最新未用验证码，按手机号 upsert 用户。"""
    phone = (body.phone or "").strip()
    code = (body.code or "").strip()
    if not phone or not code:
        raise HTTPException(status_code=400, detail="手机号或验证码不能为空")

    _consume_sms_code(db, phone, code, "login")

    # 按手机号匹配；无则新建（openid 用合成唯一值满足 NOT NULL/unique）
    user = db.query(User).filter(User.phone == phone).first()
    if not user:
        user = User(
            openid=f"phone:{phone}",
            phone=phone,
            nickname=_default_nickname(),
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    token = create_user_token(user.id)
    return ok({"token": token, "user": _user_dict(user)})


class PasswordLoginIn(BaseModel):
    phone: str
    password: str


# 密码登录失败锁定：同号 10 分钟连错上限、同 IP 更宽上限（防撞库/暴力）
PWD_FAIL_MAX = 5
PWD_FAIL_IP_MAX = 20
PWD_FAIL_WINDOW = 600


@router.post("/login/password")
def mp_login_password(body: PasswordLoginIn, request: Request, db: Session = Depends(get_db)):
    """手机号 + 密码登录。失败限频：同号 10 分钟连错 5 次、同 IP 连错 20 次即锁定。"""
    phone = (body.phone or "").strip()
    password = body.password or ""
    if not phone or not password:
        raise HTTPException(status_code=400, detail="手机号或密码不能为空")

    ip = _client_ip(request)
    phone_key = f"pwd_fail:{phone}"
    ip_key = f"pwd_fail_ip:{ip}"
    if ratelimit.fail_count(phone_key, PWD_FAIL_WINDOW) >= PWD_FAIL_MAX or (
        ip and ratelimit.fail_count(ip_key, PWD_FAIL_WINDOW) >= PWD_FAIL_IP_MAX
    ):
        raise HTTPException(status_code=429, detail="尝试过于频繁，请稍后再试")

    def _note_fail() -> None:
        ratelimit.record_fail(phone_key)
        if ip:
            ratelimit.record_fail(ip_key)

    user = db.query(User).filter(User.phone == phone).first()
    if not user or not user.password_hash:
        _note_fail()
        raise HTTPException(status_code=400, detail="账号不存在或未设置密码")
    if not verify_password(password, user.password_hash):
        _note_fail()
        raise HTTPException(status_code=400, detail="手机号或密码错误")

    ratelimit.clear_fail(phone_key)
    token = create_user_token(user.id)
    return ok({"token": token, "user": _user_dict(user)})


class SetPasswordIn(BaseModel):
    password: str


@router.post("/set-password")
def mp_set_password(
    body: SetPasswordIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """设置/修改登录密码（需登录态）。"""
    pwd = body.password or ""
    if len(pwd) < 6:
        raise HTTPException(status_code=400, detail="密码至少 6 位")
    user.password_hash = hash_password(pwd)
    db.commit()
    return ok({"ok": True})


# ── 公众号 H5（网页授权 / JSSDK）──
def _oa_cfg(db: Session) -> dict:
    row = db.query(Setting).filter(Setting.key == "oa_config").first()
    return json.loads(row.value) if row and row.value else {}


def _oauth2_access_token(app_id: str, app_secret: str, code: str) -> dict:
    """公众号网页授权：用 code 换 openid(+unionid)。失败返回 {}。"""
    import httpx
    try:
        resp = httpx.get(
            "https://api.weixin.qq.com/sns/oauth2/access_token",
            params={
                "appid": app_id,
                "secret": app_secret,
                "code": code,
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
        data = resp.json()
    except Exception as e:  # noqa: BLE001
        logger.warning("公众号 oauth2 换取失败：%s", e)
        return {}
    if data.get("openid"):
        return {"openid": data["openid"], "unionid": data.get("unionid", "")}
    logger.warning("公众号 oauth2 返回异常：%s", data)
    return {}


@router.get("/h5/oauth-url")
def h5_oauth_url(redirect: str, db: Session = Depends(get_db)):
    """返回公众号网页授权跳转地址（snsapi_base，静默授权）。未配公众号则 configured=False。"""
    from urllib.parse import quote

    cfg = _oa_cfg(db)
    app_id = cfg.get("app_id")
    if not app_id:
        return ok({"url": "", "configured": False})
    url = (
        "https://open.weixin.qq.com/connect/oauth2/authorize"
        f"?appid={app_id}&redirect_uri={quote(redirect, safe='')}"
        "&response_type=code&scope=snsapi_base&state=wx#wechat_redirect"
    )
    return ok({"url": url, "configured": True})


class H5LoginIn(BaseModel):
    code: str = ""       # 公众号网页授权 code
    guestId: str = ""    # 未配公众号时的 dev 兜底稳定标识


@router.post("/h5/login")
def h5_login(body: H5LoginIn, db: Session = Depends(get_db)):
    """H5（公众号内）登录：有 code 且已配公众号则换取真实 openid；否则用 guestId 兜底。
    身份匹配：unionid > oa_openid > 新建；oa_openid 供 H5 JSAPI 支付 payer 用。"""
    cfg = _oa_cfg(db)
    app_id = cfg.get("app_id")
    app_secret = cfg.get("app_secret")
    configured = bool(app_id and app_secret)

    oa_openid = ""
    unionid = ""
    if configured:
        # 已配公众号：必须用真实 code 换取 openid，绝不接受前端直传的 guestId
        # （否则带任意 guestId 即可绕过授权、甚至冒充他人 oa_openid 顶号）。
        if not body.code:
            raise HTTPException(status_code=400, detail="缺少授权 code")
        sess = _oauth2_access_token(app_id, app_secret, body.code)
        oa_openid = sess.get("openid", "")
        unionid = sess.get("unionid", "")
        if not oa_openid:
            raise HTTPException(status_code=400, detail="微信授权失败，请重试")
    else:
        # 未配公众号：仅开发态允许前端稳定游客标识兜底；生产拒绝
        if not settings.debug:
            raise HTTPException(status_code=503, detail="微信登录未配置")
        oa_openid = (body.guestId or "").strip()
        if not oa_openid:
            raise HTTPException(status_code=400, detail="缺少登录凭证")

    user = None
    if unionid:
        user = db.query(User).filter(User.unionid == unionid).first()
    if not user:
        user = db.query(User).filter(User.oa_openid == oa_openid).first()

    if not user:
        user = User(
            openid=oa_openid,       # 新建时 openid 用公众号 openid 填充（满足 NOT NULL/unique）
            oa_openid=oa_openid,
            unionid=unionid,
            nickname=_default_nickname(),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        changed = False
        if not user.oa_openid:
            user.oa_openid = oa_openid
            changed = True
        if unionid and not user.unionid:
            user.unionid = unionid
            changed = True
        if changed:
            db.commit()
            db.refresh(user)

    token = create_user_token(user.id)
    return ok({"token": token, "user": _user_dict(user)})


# 公众号 access_token / jsapi_ticket 缓存（与小程序 _access_token_cache 独立）
_oa_token_cache = {"token": "", "exp": 0.0}
_oa_ticket_cache = {"ticket": "", "exp": 0.0}


def _oa_access_token(db: Session) -> str:
    """获取并缓存公众号 access_token（用 oa_config 的 appid/secret）。"""
    import time as _t
    if _oa_token_cache["token"] and _oa_token_cache["exp"] > _t.time():
        return _oa_token_cache["token"]

    cfg = _oa_cfg(db)
    app_id = cfg.get("app_id")
    app_secret = cfg.get("app_secret")
    if not (app_id and app_secret):
        raise HTTPException(status_code=400, detail="未配置公众号 AppID/AppSecret")

    import httpx
    try:
        resp = httpx.get(
            "https://api.weixin.qq.com/cgi-bin/token",
            params={"grant_type": "client_credential", "appid": app_id, "secret": app_secret},
            timeout=10,
        )
        data = resp.json()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"获取公众号 access_token 失败：{e}")

    token = data.get("access_token")
    if not token:
        logger.warning("获取公众号 access_token 失败：%s", data)
        raise HTTPException(status_code=502, detail="获取微信凭证失败")
    _oa_token_cache["token"] = token
    _oa_token_cache["exp"] = _t.time() + int(data.get("expires_in", 7200)) - 300
    return token


def _oa_jsapi_ticket(db: Session) -> str:
    """获取并缓存公众号 jsapi_ticket。"""
    import time as _t
    if _oa_ticket_cache["ticket"] and _oa_ticket_cache["exp"] > _t.time():
        return _oa_ticket_cache["ticket"]

    token = _oa_access_token(db)
    import httpx
    try:
        resp = httpx.get(
            "https://api.weixin.qq.com/cgi-bin/ticket/getticket",
            params={"access_token": token, "type": "jsapi"},
            timeout=10,
        )
        data = resp.json()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"获取 jsapi_ticket 失败：{e}")

    ticket = data.get("ticket")
    if not ticket:
        logger.warning("获取 jsapi_ticket 失败：%s", data)
        raise HTTPException(status_code=502, detail="获取微信签名失败")
    _oa_ticket_cache["ticket"] = ticket
    _oa_ticket_cache["exp"] = _t.time() + int(data.get("expires_in", 7200)) - 300
    return ticket


@router.get("/h5/jssdk-config")
def h5_jssdk_config(url: str, db: Session = Depends(get_db)):
    """返回 wx.config 所需签名参数。url 为当前页完整 URL（含 query，不含 #）。
    未配公众号则 configured=False。"""
    import hashlib
    import secrets as _secrets
    import time as _t

    cfg = _oa_cfg(db)
    app_id = cfg.get("app_id")
    app_secret = cfg.get("app_secret")
    if not (app_id and app_secret):
        return ok({
            "appId": "", "timestamp": "", "nonceStr": "",
            "signature": "", "configured": False,
        })

    ticket = _oa_jsapi_ticket(db)
    timestamp = str(int(_t.time()))
    nonce_str = _secrets.token_hex(8)
    raw = f"jsapi_ticket={ticket}&noncestr={nonce_str}&timestamp={timestamp}&url={url}"
    signature = hashlib.sha1(raw.encode("utf-8")).hexdigest()
    return ok({
        "appId": app_id,
        "timestamp": timestamp,
        "nonceStr": nonce_str,
        "signature": signature,
        "configured": True,
    })


# ── 我的资料 ──
@router.get("/profile")
def mp_profile(user: User = Depends(get_current_user)):
    return ok(_user_dict(user))


class UpdateProfileIn(BaseModel):
    nickname: str | None = None
    avatar: str | None = None
    birthday: str | None = None      # 公历 ISO 日期 "1996-04-12"，空串表示清除
    birthHour: int | None = None     # 出生钟点 0-23，-1 表示清除（未知时辰）


@router.api_route("/profile", methods=["PATCH", "POST"])
def mp_update_profile(
    body: UpdateProfileIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """更新昵称 / 头像（仅传需要修改的字段）。
    同时支持 PATCH 与 POST，规避部分反向代理对 PATCH 的限制（405）。"""
    if body.nickname is not None:
        name = body.nickname.strip()
        if not name:
            raise HTTPException(status_code=400, detail="昵称不能为空")
        if len(name) > 32:
            raise HTTPException(status_code=400, detail="昵称过长")
        user.nickname = name
    if body.avatar is not None:
        user.avatar = body.avatar.strip()
    if body.birthday is not None:
        raw = body.birthday.strip()
        if not raw:
            user.birthday = None          # 传空串 = 清除生日
        else:
            try:
                d = date.fromisoformat(raw)
            except ValueError:
                raise HTTPException(status_code=400, detail="生日格式应为 YYYY-MM-DD")
            today = date.today()
            if d > today:
                raise HTTPException(status_code=400, detail="生日不能晚于今天")
            if d.year < 1900:
                raise HTTPException(status_code=400, detail="生日年份过早")
            user.birthday = d
    if body.birthHour is not None:
        # -1 是前端「未知时辰」的清除信号；其余必须是合法钟点
        if body.birthHour < 0:
            user.birth_hour = None
        elif body.birthHour > 23:
            raise HTTPException(status_code=400, detail="出生时辰不合法")
        else:
            user.birth_hour = body.birthHour
    db.commit()
    db.refresh(user)
    return ok(_user_dict(user))


# ── 用户上传（头像）──
MP_UPLOAD_MAX = 5 * 1024 * 1024  # 头像 5MB


@router.post("/upload")
async def mp_upload(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """用户态上传（目前仅头像，限图片 5MB）。走统一存储层，OSS/本地透明。"""
    ext = storage.ext_of(file.filename)
    if ext not in storage.IMAGE_EXT:
        raise HTTPException(status_code=400, detail="仅支持图片")
    content = await file.read()
    if len(content) > MP_UPLOAD_MAX:
        raise HTTPException(status_code=400, detail="图片不能超过 5MB")
    try:
        result = storage.save_bytes(db, content, ext, base_url=str(request.base_url))
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ok(result)


@router.get("/membership")
def mp_membership(user: User = Depends(get_current_user)):
    return ok({
        "type": user.membership_type,
        "name": user.membership_name,
        "expireAt": user.membership_expire_at.isoformat() if user.membership_expire_at else None,
        "source": user.membership_source,
        "isPremium": _is_premium(user),
    })


# ── 绑定手机号 ──
class BindPhoneIn(BaseModel):
    phone: str
    code: str = ""


@router.post("/bind-phone")
def bind_phone(
    body: BindPhoneIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """绑定/改绑手机号：格式校验 + scene=bind 短信验证码 + 手机号唯一。

    必须验短信码，否则任何登录态都能把任意号码占为己有（并因此获得
    「手机号 + 密码」登录路径）。验证码由 POST /api/mp/sms/send {scene:'bind'} 下发。
    """
    phone = (body.phone or "").strip()
    code = (body.code or "").strip()
    if not PHONE_RE.match(phone):
        raise HTTPException(status_code=400, detail="手机号格式不正确")
    if not code:
        raise HTTPException(status_code=400, detail="请输入验证码")
    # 唯一性：该号已被其他账号绑定则拒绝（排除自身，允许重复绑定本人号码）
    exists = (
        db.query(User)
        .filter(User.phone == phone, User.id != user.id)
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="该手机号已被其他账号绑定")
    _consume_sms_code(db, phone, code, "bind")
    user.phone = phone
    db.commit()
    db.refresh(user)
    return ok({"phone": user.phone})


# ── 测评提交 ──
class QuizIn(BaseModel):
    element: str
    scores: dict


@router.post("/quiz")
def mp_quiz(
    body: QuizIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user.element = body.element
    user.element_scores = json.dumps(body.scores, ensure_ascii=False)
    user.quiz_completed_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return ok(_user_dict(user))


# ── 五行 + 曲目（公开，免登录）──
def _parse_plays(s: str) -> int:
    """把后台填的 '12.4k' / '900' 解析为整数基数。"""
    s = (s or "").strip().lower()
    if not s:
        return 0
    try:
        if s.endswith("k"):
            return int(float(s[:-1]) * 1000)
        if s.endswith("w"):
            return int(float(s[:-1]) * 10000)
        return int(float(s))
    except ValueError:
        return 0


def _format_plays(n: int) -> str:
    """整数播放量格式化为 '12.4k' 展示。"""
    if n >= 10000:
        return f"{n / 1000:.1f}k"
    if n >= 1000:
        return f"{n / 1000:.1f}k"
    return str(n)


def _play_counts(db: Session) -> dict:
    """每首曲目的真实聆听次数 {track_id: count}。"""
    from sqlalchemy import func
    rows = (
        db.query(PlayHistory.track_id, func.count(PlayHistory.id))
        .group_by(PlayHistory.track_id)
        .all()
    )
    return {tid: cnt for tid, cnt in rows}


def _track_dict(t: Track, counts: dict | None = None) -> dict:
    # 真实播放量 = 后台基数 + 实际聆听次数（提供 counts 时）
    plays = t.plays
    if counts is not None:
        plays = _format_plays(_parse_plays(t.plays) + counts.get(t.id, 0))
    return {
        "id": t.id,
        "title": t.title,
        "duration": t.duration,
        "durationSec": t.duration_sec,
        "hz": t.hz,
        "tag": t.tag,
        "plays": plays,
        "audioUrl": t.audio_url,
        "coverUrl": t.cover_url,
        "isPremium": t.is_premium,
        "previewSec": t.preview_sec,
    }


@router.get("/elements")
def mp_elements(db: Session = Depends(get_db)):
    els = db.query(Element).order_by(Element.sort).all()
    counts = _play_counts(db)
    result = []
    for e in els:
        tracks = (
            db.query(Track)
            .filter(Track.element_id == e.id, Track.is_online == True)  # noqa: E712
            .order_by(Track.sort)
            .all()
        )
        result.append({
            "id": e.id,
            "en": e.en,
            "icon": e.icon,
            "primary": e.primary,
            "accent": e.accent,
            "glow": e.glow,
            "bg": e.bg,
            "note": e.note,
            "notePinyin": e.note_pinyin,
            "organ": e.organ,
            "season": e.season,
            "quality": e.quality,
            "desc": e.desc,
            "sleepTip": e.sleep_tip,
            "tracks": [_track_dict(t, counts) for t in tracks],
        })
    return ok(result)


@router.get("/plans")
def mp_plans(db: Session = Depends(get_db)):
    rows = db.query(Plan).filter(Plan.is_active == True).order_by(Plan.sort).all()  # noqa: E712
    return ok([
        {
            "id": p.id, "name": p.name, "en": p.en, "price": p.price,
            "original": p.original, "unit": p.unit, "badge": p.badge,
            "features": json.loads(p.features or "[]"), "featured": p.featured,
        }
        for p in rows
    ])


# ── CDKEY 兑换（真实）──
class RedeemIn(BaseModel):
    code: str


# CDKEY 兑换失败限频：单用户每分钟最多 5 次失败（CLAUDE.md 约定，防暴力猜码）
CDKEY_FAIL_MAX = 5
CDKEY_FAIL_WINDOW = 60


@router.post("/cdkey/redeem")
def mp_redeem(
    body: RedeemIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    fail_key = f"cdkey_fail:{user.id}"
    if ratelimit.fail_count(fail_key, CDKEY_FAIL_WINDOW) >= CDKEY_FAIL_MAX:
        raise HTTPException(status_code=429, detail="兑换过于频繁，请稍后再试")

    def _reject(detail: str) -> NoReturn:
        ratelimit.record_fail(fail_key)
        raise HTTPException(status_code=400, detail=detail)

    code = body.code.strip().upper()
    key = db.query(Cdkey).filter(Cdkey.code == code).first()
    if not key:
        _reject("兑换码不存在")
    if key.status == "used":
        _reject("兑换码已被使用")
    if key.status in ("disabled", "expired"):
        _reject("兑换码不可用")
    if key.expire_at and key.expire_at < datetime.utcnow():
        _reject("兑换码已过期")

    # 发放权益：剩余期叠加
    now = datetime.utcnow()
    base = user.membership_expire_at if (user.membership_expire_at and user.membership_expire_at > now) else now
    expire_at = base + timedelta(days=key.duration_days)
    user.membership_type = key.plan_type
    user.membership_name = key.plan_name
    user.membership_expire_at = expire_at
    user.membership_source = "cdkey"

    key.status = "used"
    key.used_by = user.id
    key.used_at = now
    db.add(CdkeyRedeemLog(user_id=user.id, cdkey_id=key.id, ip=_client_ip(request)))
    db.commit()
    db.refresh(user)
    ratelimit.clear_fail(fail_key)

    return ok({
        "plan": key.plan_name,
        "type": key.plan_type,
        "days": key.duration_days,
        "expireAt": expire_at.isoformat(),
        "membership": _user_dict(user)["membership"],
    })


# ── 支付 ──
def _pay_cfg(db: Session) -> dict:
    row = db.query(Setting).filter(Setting.key == "pay_config").first()
    return json.loads(row.value) if row and row.value else {}


def _gen_order_no() -> str:
    return datetime.utcnow().strftime("%Y%m%d%H%M%S") + uuid.uuid4().hex[:10]


def _grant_membership(db: Session, user: User, plan: Plan, source: str = "purchase") -> None:
    """按套餐天数累加会员有效期（已是会员则从到期日续期）。"""
    now = datetime.utcnow()
    base = user.membership_expire_at if (user.membership_expire_at and user.membership_expire_at > now) else now
    user.membership_type = plan.id
    user.membership_name = plan.name
    user.membership_expire_at = base + timedelta(days=plan.duration_days)
    user.membership_source = source
    db.commit()
    db.refresh(user)


def _resolve_pay_payer(db: Session, user: User, channel: str, order: Order):
    """按下单渠道确定 JSAPI payer openid 与 appid。
    h5：用公众号 oa_openid + oa_config.app_id（未微信登录则订单置失败并 400）。
    weapp/缺省：用小程序 openid + 默认 appid（app_id=None，wxpay 内部用 wx_app_id）。
    返回 (payer_openid, pay_app_id)。"""
    if (channel or "weapp") == "h5":
        if not user.oa_openid:
            order.status = "failed"
            db.commit()
            raise HTTPException(status_code=400, detail="请先微信登录")
        return user.oa_openid, (_oa_cfg(db).get("app_id") or None)
    return user.openid, None


class CreateOrderIn(BaseModel):
    planId: str
    channel: str = "weapp"   # weapp（小程序）| h5（公众号网页 JSAPI）


@router.post("/pay/create-order")
def mp_create_order(
    body: CreateOrderIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    plan = db.query(Plan).filter(Plan.id == body.planId).first()
    if not plan:
        raise HTTPException(status_code=404, detail="套餐不存在")

    cfg = _pay_cfg(db)
    pay_enabled = bool(cfg.get("enabled")) and bool(cfg.get("wx_mch_id")) and bool(cfg.get("wx_key_pem"))

    # 创建订单（pending）
    order = Order(
        order_no=_gen_order_no(),
        user_id=user.id,
        plan_id=plan.id,
        plan_name=plan.name,
        amount=plan.price,
        status="pending",
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    if not pay_enabled:
        if not settings.debug:
            # 生产未配支付：拒绝，绝不免付开通
            order.status = "failed"
            db.commit()
            raise HTTPException(status_code=400, detail="支付未配置")
        # 开发期：直接开通，便于联调
        _grant_membership(db, user, plan)
        order.status = "paid"
        order.paid_at = datetime.utcnow()
        # 分成与「订单转已支付」同一次提交，避免出现付了款却没记账的中间态
        agent_service.record_commission(db, order)
        db.commit()
        return ok({
            "dev_opened": True,
            "orderNo": order.order_no,
            "membership": _user_dict(user)["membership"],
        })

    # 生产：调微信 JSAPI 统一下单，返回前端 requestPayment 参数
    payer_openid, pay_app_id = _resolve_pay_payer(db, user, body.channel, order)

    try:
        pay_params = wxpay.create_jsapi_order(
            cfg,
            openid=payer_openid,
            order_no=order.order_no,
            amount_fen=int(round(plan.price * 100)),
            description=f"五行律音 · {plan.name}",
            app_id=pay_app_id,
        )
    except wxpay.WxPayError as e:
        # 上游原文仅入日志，对外返回通用文案（避免泄露商户/接口细节）
        logger.warning("微信下单失败（订单 %s）：%s", order.order_no, e)
        order.status = "failed"
        db.commit()
        raise HTTPException(status_code=400, detail="支付下单失败，请稍后重试")

    return ok({
        "dev_opened": False,
        "orderNo": order.order_no,
        "payParams": pay_params,
    })


@router.post("/pay/callback")
async def mp_pay_callback(request: Request, db: Session = Depends(get_db)):
    """微信支付结果通知。解密后校验金额/状态，幂等开通会员。
    返回 {code:'SUCCESS'} 告知微信已受理，避免重复回调。"""
    fail = JSONResponse(status_code=500, content={"code": "FAIL", "message": "处理失败"})
    cfg = _pay_cfg(db)
    try:
        envelope = json.loads(await request.body())
        resource = envelope.get("resource") or {}
        data = wxpay.decrypt_callback_resource(cfg.get("wx_api_key", ""), resource)
    except Exception as e:  # noqa: BLE001
        logger.warning("支付回调解密失败：%s", e)
        return fail

    if data.get("trade_state") != "SUCCESS":
        return JSONResponse(content={"code": "SUCCESS", "message": "已接收"})

    order_no = data.get("out_trade_no")
    order = db.query(Order).filter(Order.order_no == order_no).first()
    if not order:
        logger.warning("支付回调订单不存在：%s", order_no)
        return JSONResponse(content={"code": "SUCCESS", "message": "已接收"})

    if order.status == "paid":  # 幂等：重复回调直接成功
        return JSONResponse(content={"code": "SUCCESS", "message": "已处理"})

    # 金额校验（分）
    paid_fen = (data.get("amount") or {}).get("total")
    if paid_fen is not None and int(paid_fen) != int(round(order.amount * 100)):
        logger.warning("支付回调金额不符：订单 %s 期望 %s 实付 %s", order_no, order.amount, paid_fen)
        return fail

    plan = db.query(Plan).filter(Plan.id == order.plan_id).first()
    if not plan:
        return fail

    # 礼物订单：支付后生成 CDKEY，不直接给买家开通会员
    if order.is_gift:
        if not order.gift_code:
            order.gift_code = _issue_gift_cdkey(db, plan, order.order_no)
    else:
        user = db.query(User).filter(User.id == order.user_id).first()
        if user:
            _grant_membership(db, user, plan)
    order.status = "paid"
    order.transaction_id = data.get("transaction_id", "")
    order.paid_at = datetime.utcnow()
    # 代理分成：模块关闭 / 用户无绑定代理时内部直接 return，不落库。
    # 重复回调由 commission.order_id 的唯一约束兜住，不会重复记账。
    agent_service.record_commission(db, order)
    db.commit()
    return JSONResponse(content={"code": "SUCCESS", "message": "成功"})


# ── 买卡送人（礼物码）──
_GIFT_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _gen_gift_code() -> str:
    seg = lambda: "".join(__import__("secrets").choice(_GIFT_CHARSET) for _ in range(4))
    return f"GIFT-{datetime.utcnow().year}-{seg()}-{seg()}"


def _issue_gift_cdkey(db: Session, plan: Plan, order_no: str) -> str:
    """生成一个未使用的礼物 CDKEY（唯一），关联订单号写入 remark。"""
    existing = {c.code for c in db.query(Cdkey.code).all()}
    for _ in range(50):
        code = _gen_gift_code()
        if code in existing:
            continue
        db.add(Cdkey(
            code=code,
            batch_id="gift",
            plan_type=plan.id,
            duration_days=plan.duration_days,
            plan_name=plan.name,
            remark=f"礼物订单 {order_no}",
        ))
        db.commit()
        return code
    raise HTTPException(status_code=500, detail="生成礼物码失败，请重试")


class GiftOrderIn(BaseModel):
    planId: str
    channel: str = "weapp"   # weapp（小程序）| h5（公众号网页 JSAPI）


@router.post("/gift/create-order")
def mp_gift_create_order(
    body: GiftOrderIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """买卡送人：创建礼物订单。支付完成后生成礼物 CDKEY。"""
    plan = db.query(Plan).filter(Plan.id == body.planId).first()
    if not plan or plan.id == "free":
        raise HTTPException(status_code=404, detail="套餐不存在")

    cfg = _pay_cfg(db)
    pay_enabled = bool(cfg.get("enabled")) and bool(cfg.get("wx_mch_id")) and bool(cfg.get("wx_key_pem"))

    order = Order(
        order_no=_gen_order_no(),
        user_id=user.id,
        plan_id=plan.id,
        plan_name=plan.name,
        amount=plan.price,
        status="pending",
        is_gift=True,
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    if not pay_enabled:
        if not settings.debug:
            # 生产未配支付：拒绝，绝不免付发码
            order.status = "failed"
            db.commit()
            raise HTTPException(status_code=400, detail="支付未配置")
        # 开发期：直接生成礼物码
        order.gift_code = _issue_gift_cdkey(db, plan, order.order_no)
        order.status = "paid"
        order.paid_at = datetime.utcnow()
        db.commit()
        return ok({
            "dev_opened": True,
            "orderNo": order.order_no,
            "giftCode": order.gift_code,
            "planName": plan.name,
        })

    payer_openid, pay_app_id = _resolve_pay_payer(db, user, body.channel, order)

    try:
        pay_params = wxpay.create_jsapi_order(
            cfg,
            openid=payer_openid,
            order_no=order.order_no,
            amount_fen=int(round(plan.price * 100)),
            description=f"五行律音礼物卡 · {plan.name}",
            app_id=pay_app_id,
        )
    except wxpay.WxPayError as e:
        logger.warning("礼物卡下单失败（订单 %s）：%s", order.order_no, e)
        order.status = "failed"
        db.commit()
        raise HTTPException(status_code=400, detail="支付下单失败，请稍后重试")

    return ok({
        "dev_opened": False,
        "orderNo": order.order_no,
        "payParams": pay_params,
        "planName": plan.name,
    })


@router.get("/gift/code")
def mp_gift_code(
    orderNo: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """支付完成后查询礼物码（前端轮询用）。"""
    order = db.query(Order).filter(
        Order.order_no == orderNo, Order.user_id == user.id, Order.is_gift == True  # noqa: E712
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")
    return ok({
        "status": order.status,
        "giftCode": order.gift_code,
        "planName": order.plan_name,
    })


# ── 我的订单 ──
@router.get("/orders")
def mp_my_orders(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """当前用户的订单列表（会员开通 + 礼物卡），按时间倒序。"""
    rows = (
        db.query(Order)
        .filter(Order.user_id == user.id)
        .order_by(Order.id.desc())
        .limit(100)
        .all()
    )
    items = []
    for o in rows:
        items.append({
            "orderNo": o.order_no,
            "planId": o.plan_id,
            "planName": o.plan_name,
            "amount": o.amount,
            "status": o.status,
            "isGift": bool(o.is_gift),
            "giftCode": o.gift_code if o.is_gift else "",
            "paidAt": o.paid_at.isoformat() if o.paid_at else None,
            "createdAt": o.created_at.isoformat() if o.created_at else None,
        })
    return ok(items)


# ── 聆听历史 ──
class HistoryIn(BaseModel):
    track_id: int


@router.post("/history")
def add_history(
    body: HistoryIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.add(PlayHistory(user_id=user.id, track_id=body.track_id))
    db.commit()
    return ok({"saved": True})


@router.get("/history")
def list_history(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 取该用户最近记录，按曲目去重保留最新，最多 50 条
    rows = (
        db.query(PlayHistory)
        .filter(PlayHistory.user_id == user.id)
        .order_by(PlayHistory.played_at.desc())
        .limit(300)
        .all()
    )
    seen: set[int] = set()
    items = []
    for h in rows:
        if h.track_id in seen:
            continue
        seen.add(h.track_id)
        t = db.query(Track).filter(Track.id == h.track_id).first()
        if not t:
            continue
        d = _track_dict(t)
        d["element_id"] = t.element_id
        d["played_at"] = h.played_at.isoformat() if h.played_at else None
        items.append(d)
        if len(items) >= 50:
            break
    return ok(items)


# ── 本周聆听统计 ──
@router.get("/stats/weekly")
def stats_weekly(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """近 7 天聆听统计：每天聆听次数与估算分钟（按曲目时长累加）。
    返回 days[]（从 6 天前到今天）+ 本周总时长。"""
    from datetime import date, time as dtime

    today = datetime.utcnow().date()
    start = today - timedelta(days=6)
    start_dt = datetime.combine(start, dtime.min)

    rows = (
        db.query(PlayHistory.played_at, Track.duration_sec)
        .join(Track, Track.id == PlayHistory.track_id)
        .filter(PlayHistory.user_id == user.id, PlayHistory.played_at >= start_dt)
        .all()
    )

    # 初始化 7 天桶
    buckets: dict[date, dict] = {
        start + timedelta(days=i): {"count": 0, "seconds": 0} for i in range(7)
    }
    for played_at, dur_sec in rows:
        d = played_at.date()
        if d in buckets:
            buckets[d]["count"] += 1
            buckets[d]["seconds"] += int(dur_sec or 0)

    week_labels = ["一", "二", "三", "四", "五", "六", "日"]
    days = []
    total_sec = 0
    for i in range(7):
        d = start + timedelta(days=i)
        b = buckets[d]
        total_sec += b["seconds"]
        is_today = d == today
        days.append({
            "date": d.isoformat(),
            "label": "今" if is_today else week_labels[d.weekday()],
            "count": b["count"],
            "minutes": round(b["seconds"] / 60),
            "isToday": is_today,
        })

    return ok({
        "days": days,
        "totalMinutes": round(total_sec / 60),
        "totalHours": round(total_sec / 3600, 1),
    })


# ── 小程序码（海报二维码用）──
_access_token_cache = {"token": "", "exp": 0.0}


def _get_access_token(db: Session) -> str:
    """获取并缓存微信 access_token（有效期约 7200s，提前 5 分钟过期）。"""
    import time as _t
    if _access_token_cache["token"] and _access_token_cache["exp"] > _t.time():
        return _access_token_cache["token"]

    row = db.query(Setting).filter(Setting.key == "mp_config").first()
    cfg = json.loads(row.value) if row and row.value else {}
    app_id = cfg.get("app_id")
    app_secret = cfg.get("app_secret")
    if not (app_id and app_secret):
        raise HTTPException(status_code=400, detail="未配置小程序 AppID/AppSecret")

    import httpx
    try:
        resp = httpx.get(
            "https://api.weixin.qq.com/cgi-bin/token",
            params={"grant_type": "client_credential", "appid": app_id, "secret": app_secret},
            timeout=10,
        )
        data = resp.json()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"获取 access_token 失败：{e}")

    token = data.get("access_token")
    if not token:
        logger.warning("获取小程序 access_token 失败：%s", data)
        raise HTTPException(status_code=502, detail="获取微信凭证失败")
    _access_token_cache["token"] = token
    _access_token_cache["exp"] = _t.time() + int(data.get("expires_in", 7200)) - 300
    return token


class QrcodeIn(BaseModel):
    scene: str = ""           # 携带参数（如邀请人/礼物码），<=32 字符
    page: str = "pages/home/index"


@router.post("/qrcode")
def mp_qrcode(
    body: QrcodeIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """生成无限量小程序码（getUnlimited），存储后返回可访问 URL。"""
    token = _get_access_token(db)
    scene = (body.scene or f"u={user.id}")[:32]

    import httpx
    try:
        resp = httpx.post(
            f"https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token={token}",
            json={
                "scene": scene,
                "page": body.page or "pages/home/index",
                "check_path": False,        # 开发期页面可能未发布
                "env_version": "release",
                "width": 280,
            },
            timeout=15,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"生成小程序码失败：{e}")

    ctype = resp.headers.get("content-type", "")
    if "image" not in ctype:
        # 返回的是 JSON 错误：原文入日志，对外通用文案
        logger.warning("生成小程序码失败：%s", resp.text)
        raise HTTPException(status_code=400, detail="生成小程序码失败，请稍后重试")

    try:
        result = storage.save_bytes(db, resp.content, ".png", base_url=str(request.base_url))
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ok(result)


class UrlQrcodeIn(BaseModel):
    url: str


@router.post("/qrcode/url")
def mp_qrcode_url(
    body: UrlQrcodeIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """生成普通链接二维码（H5 海报用）。

    海报上原本一律是**小程序码**，H5 用户扫了会被拉去小程序——
    对纯 H5 的分享链路是断的。这里按传入的 H5 地址生成标准二维码。
    """
    url = (body.url or "").strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="二维码地址不合法")
    if len(url) > 512:
        raise HTTPException(status_code=400, detail="二维码地址过长")

    try:
        import io as _io
        import qrcode
    except ImportError:
        raise HTTPException(status_code=400, detail="服务端未安装二维码组件")

    img = qrcode.make(url)
    buf = _io.BytesIO()
    img.save(buf, format="PNG")

    try:
        result = storage.save_bytes(db, buf.getvalue(), ".png", base_url=str(request.base_url))
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ok(result)


# ── 代理分成（默认整体关闭：未开启时下列接口一律 404）──
#
# 归因是「首次扫码永久绑定」：推广码经小程序码 scene / H5 链接的 ?a= 带进来，
# 前端先存本地，登录后再调 /agent/bind。已绑定的不改绑。


class AgentBindIn(BaseModel):
    code: str = ""


@router.post("/agent/bind")
def mp_agent_bind(
    body: AgentBindIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """绑定推广码。已绑定 / 码无效 / 绑自己都返回 bound=false，由前端静默处理。

    只有 bound=true 才值得提示用户；其余情况弹窗都是噪音。
    """
    agent_service.require_enabled(db)
    return ok(agent_service.bind_agent(db, user, body.code))


@router.get("/agent/me")
def mp_agent_me(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """代理中心首屏：身份 + 推广码 + 余额 + 本月业绩。

    非代理用户返回 isAgent=false，前端据此不渲染入口——
    与「模块未开启时 404」共同保证：普通用户看不到任何痕迹。
    """
    cfg = agent_service.require_enabled(db)
    agent = agent_service.agent_of_user(db, user)
    if not agent:
        return ok({"isAgent": False})

    # 本月业绩：按自然月起点算，与代理对账的直觉一致
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_rows = (
        db.query(Commission)
        .filter(
            Commission.agent_id == agent.id,
            Commission.created_at >= month_start,
            Commission.status != "void",
        )
        .all()
    )
    # 不再下发上级信息：加法模型下上级那份是平台额外出的，代理拿满自己的比例，
    # 没有「怎么只拿到 15 不是 20」可解释——多说反而让人以为被抽了。
    return ok({
        "isAgent": True,
        "agent": agent_service.agent_dict(agent, cfg),
        "balance": agent_service.balance_of(db, agent.id),
        "month": {
            "count": len(month_rows),
            "amount": round(sum(float(r.amount or 0) for r in month_rows), 2),
            "gmv": round(sum(float(r.order_amount or 0) for r in month_rows), 2),
        },
        "minWithdraw": float(cfg.get("min_withdraw") or 0),
        "freezeDays": int(cfg.get("freeze_days") or 0),
    })


def _require_agent(db: Session, user: User) -> Agent:
    agent = agent_service.agent_of_user(db, user)
    if not agent:
        raise HTTPException(status_code=403, detail="您还不是代理")
    return agent


@router.get("/agent/commissions")
def mp_agent_commissions(
    page: int = 1,
    size: int = 20,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """分成明细。只回自己的，且不暴露买家身份（隐私）。"""
    agent_service.require_enabled(db)
    agent = _require_agent(db, user)
    size = max(1, min(size, 50))
    q = db.query(Commission).filter(Commission.agent_id == agent.id)
    total = q.count()
    rows = (
        q.order_by(Commission.created_at.desc())
        .offset((max(page, 1) - 1) * size)
        .limit(size)
        .all()
    )
    now = datetime.utcnow()
    # 加成来自哪个下级，给代理看得懂的名字
    src_ids = {r.source_agent_id for r in rows if r.source_agent_id}
    src_names = (
        {a.id: a.name for a in db.query(Agent).filter(Agent.id.in_(src_ids)).all()}
        if src_ids else {}
    )
    return ok({
        "total": total,
        "items": [{
            "id": r.id,
            "amount": r.amount,
            "orderAmount": r.order_amount,
            "level": r.level,
            # 不下发 base_amount：那是本单的平台总支出，代理不该看到平台成本
            "sourceAgentName": src_names.get(r.source_agent_id or 0, ""),
            "rate": r.rate,
            # pending 但已过冻结期，对代理而言就是「可提现」，别显示成冻结中
            "status": "available" if (
                r.status == "pending" and r.available_at and r.available_at <= now
            ) else r.status,
            "availableAt": r.available_at.isoformat() if r.available_at else None,
            "createdAt": r.created_at.isoformat() if r.created_at else None,
        } for r in rows],
    })


@router.get("/agent/downline")
def mp_agent_downline(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """我的下级：直接下级代理（含各自为我带来的抽成）+ 我推广的用户数。

    只有一层——下级的下级与我无关，这是计酬封顶为两级的直接体现。
    """
    agent_service.require_enabled(db)
    agent = _require_agent(db, user)
    d = agent_service.downline_of(db, agent.id)
    # 代理中心不需要看到名下用户的手机号等身份信息，只给数量
    d.pop("users", None)
    return ok(d)


class WithdrawIn(BaseModel):
    amount: float


@router.post("/agent/withdraw")
def mp_agent_withdraw(
    body: WithdrawIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """发起提现。真出钱的入口，校验从严：

    金额一律以服务端重算的余额为准（绝不信前端），同一代理同时只允许一笔在途。
    """
    cfg = agent_service.require_enabled(db)
    agent = _require_agent(db, user)

    ip = ratelimit.client_ip(request)
    if ip and ratelimit.fail_count(f"withdraw:{ip}", 3600) >= 20:
        raise HTTPException(status_code=429, detail="操作过于频繁，请稍后再试")

    amount = round(float(body.amount or 0), 2)
    min_withdraw = float(cfg.get("min_withdraw") or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="提现金额不合法")
    if amount < min_withdraw:
        raise HTTPException(status_code=400, detail=f"最低提现 {min_withdraw:.2f} 元")
    if agent_service.has_open_withdrawal(db, agent.id):
        raise HTTPException(status_code=400, detail="已有提现在处理中，请等待完成")

    picked = agent_service.pick_for_withdraw(db, agent.id, amount)
    if not picked:
        raise HTTPException(status_code=400, detail="可提现余额不足")

    # 按整条分成记录结算，实际金额可能略高于申请额——四舍五入到分不拆记录，
    # 拆记录会让明细与提现单对不上，代理更难核对。
    real_amount = round(sum(float(r.amount or 0) for r in picked), 2)
    wd = Withdrawal(
        agent_id=agent.id,
        amount=real_amount,
        status="pending",
        payout_mode=str(cfg.get("payout_mode") or "manual"),
    )
    db.add(wd)
    db.flush()
    for r in picked:
        r.status = "withdrawing"
        r.withdrawal_id = wd.id
    db.commit()
    if ip:
        ratelimit.record_fail(f"withdraw:{ip}")
    return ok({"id": wd.id, "amount": real_amount, "status": wd.status})


@router.get("/agent/withdrawals")
def mp_agent_withdrawals(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """我的提现记录（最近 30 条）。"""
    agent_service.require_enabled(db)
    agent = _require_agent(db, user)
    rows = (
        db.query(Withdrawal)
        .filter(Withdrawal.agent_id == agent.id)
        .order_by(Withdrawal.created_at.desc())
        .limit(30)
        .all()
    )
    return ok([{
        "id": r.id,
        "amount": r.amount,
        "status": r.status,
        "failReason": r.fail_reason,
        "paidAt": r.paid_at.isoformat() if r.paid_at else None,
        "createdAt": r.created_at.isoformat() if r.created_at else None,
    } for r in rows])
