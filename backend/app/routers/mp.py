"""小程序/APP 端公开接口（用户态）。

真实环境中 wx-login 需用 code 调微信换 openid/unionid；此处接口约定为前端传
已换取的 openid/unionid（或服务端换取后调用），便于联调与 APP 复用。
鉴权：登录返回用户 JWT（sub=user:<id>），后续接口用 Bearer 携带。
"""
import json
import logging
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import storage, wxpay
from app.config import settings
from app.database import get_db
from app.models import Cdkey, CdkeyRedeemLog, Element, Order, PlayHistory, Plan, Setting, Track, User

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/mp", tags=["miniprogram"])


def ok(data=None, msg="ok"):
    return {"code": 0, "data": data, "msg": msg}


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
        "nickname": u.nickname,
        "avatar": u.avatar,
        "element": u.element,
        "elementScores": json.loads(u.element_scores or "{}"),
        "quizCompletedAt": u.quiz_completed_at.isoformat() if u.quiz_completed_at else None,
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
    """登录：用 code 换稳定 openid（配置了小程序密钥时）；否则回退前端直传的 openid。
    识别优先级：unionid > openid。"""
    openid = body.openid
    unionid = body.unionid

    # 优先用 code 换取真实、稳定的 openid/unionid
    sess = _jscode2session(db, body.code)
    if sess:
        openid = sess["openid"]
        unionid = sess.get("unionid") or unionid

    if not openid:
        raise HTTPException(status_code=400, detail="缺少登录凭证")

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


# ── 我的资料 ──
@router.get("/profile")
def mp_profile(user: User = Depends(get_current_user)):
    return ok(_user_dict(user))


class UpdateProfileIn(BaseModel):
    nickname: str | None = None
    avatar: str | None = None


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


@router.post("/bind-phone")
def bind_phone(
    body: BindPhoneIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not body.phone or len(body.phone) < 6:
        raise HTTPException(status_code=400, detail="手机号不合法")
    user.phone = body.phone
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


@router.post("/cdkey/redeem")
def mp_redeem(
    body: RedeemIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    code = body.code.strip().upper()
    key = db.query(Cdkey).filter(Cdkey.code == code).first()
    if not key:
        raise HTTPException(status_code=400, detail="兑换码不存在")
    if key.status == "used":
        raise HTTPException(status_code=400, detail="兑换码已被使用")
    if key.status in ("disabled", "expired"):
        raise HTTPException(status_code=400, detail="兑换码不可用")
    if key.expire_at and key.expire_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="兑换码已过期")

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
    db.add(CdkeyRedeemLog(user_id=user.id, cdkey_id=key.id))
    db.commit()
    db.refresh(user)

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


class CreateOrderIn(BaseModel):
    planId: str


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
        # 开发期/未配置支付：直接开通，便于联调
        _grant_membership(db, user, plan)
        order.status = "paid"
        order.paid_at = datetime.utcnow()
        db.commit()
        return ok({
            "dev_opened": True,
            "orderNo": order.order_no,
            "membership": _user_dict(user)["membership"],
        })

    # 生产：调微信 JSAPI 统一下单，返回前端 requestPayment 参数
    try:
        pay_params = wxpay.create_jsapi_order(
            cfg,
            openid=user.openid,
            order_no=order.order_no,
            amount_fen=int(round(plan.price * 100)),
            description=f"五行律音 · {plan.name}",
        )
    except wxpay.WxPayError as e:
        order.status = "failed"
        db.commit()
        raise HTTPException(status_code=400, detail=str(e))

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

    user = db.query(User).filter(User.id == order.user_id).first()
    if user:
        _grant_membership(db, user, plan)
    order.status = "paid"
    order.transaction_id = data.get("transaction_id", "")
    order.paid_at = datetime.utcnow()
    db.commit()
    return JSONResponse(content={"code": "SUCCESS", "message": "成功"})


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
