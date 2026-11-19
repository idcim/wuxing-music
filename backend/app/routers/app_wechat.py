"""移动应用微信原生授权；凭据与网站扫码登录完全独立。"""
import hashlib
import hmac
import json
import re
import secrets
import time
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app import ratelimit
from app.database import get_db
from app.models import Admin, Setting, User
from app.schemas import ok
from app.security import require_perm
from app.user_merge import resolve_login
from app.routers.mp import create_user_token, _default_nickname, _user_dict

router = APIRouter(tags=['app-wechat'])
CONFIG_KEY = 'app_wechat_config'
DEFAULTS = dict(enabled=False, app_id='', app_secret='', android_package='cn.azureglow.wuxing.preview', android_signature='', ios_bundle_id='', privacy_policy='')


def configuration(db):
    row = db.get(Setting, CONFIG_KEY)
    return {**DEFAULTS, **(json.loads(row.value) if row and row.value else {})}


def ready(cfg):
    return bool(cfg['enabled'] and cfg['app_id'] and cfg['app_secret'] and cfg['android_package'] and cfg['android_signature'] and cfg['privacy_policy'])


class WechatConfig(BaseModel):
    enabled: bool = False
    app_id: str = Field(default='', max_length=64)
    app_secret: str = Field(default='', max_length=255)
    android_package: str = Field(default='cn.azureglow.wuxing.preview', max_length=160)
    android_signature: str = Field(default='', max_length=95)
    ios_bundle_id: str = Field(default='', max_length=160)
    privacy_policy: str = Field(default='', max_length=12000)


@router.get('/api/admin/apps/wechat')
def admin_config(db: Session = Depends(get_db), _: Admin = Depends(require_perm('apps:view'))):
    cfg = configuration(db)
    return ok({**{k: v for k, v in cfg.items() if k != 'app_secret'}, 'app_secret_set': bool(cfg['app_secret'])})


@router.put('/api/admin/apps/wechat')
def save_config(body: WechatConfig, db: Session = Depends(get_db), _: Admin = Depends(require_perm('apps:edit'))):
    old = configuration(db)
    cfg = {k: v.strip() if isinstance(v, str) else v for k, v in body.model_dump().items()}
    cfg['app_secret'] = cfg['app_secret'] or old['app_secret']
    cfg['android_signature'] = cfg['android_signature'].replace(':', '').lower()
    if cfg['app_id'] and not re.fullmatch(r'wx[0-9a-fA-F]{16}', cfg['app_id']):
        raise HTTPException(422, '请填写微信开放平台移动应用 AppID')
    if cfg['android_signature'] and not re.fullmatch(r'[0-9a-f]{32}', cfg['android_signature']):
        raise HTTPException(422, '应用签名请填写 APK 证书的 32 位 MD5')
    if cfg['enabled'] and not ready(cfg):
        raise HTTPException(422, '开启前请填写移动应用 AppID、AppSecret、安卓包名、签名 MD5 与 APP 隐私政策')
    row = db.get(Setting, CONFIG_KEY)
    if row is None:
        row = Setting(key=CONFIG_KEY)
        db.add(row)
    row.value = json.dumps(cfg, ensure_ascii=False)
    db.commit()
    return ok({'saved': True})


@router.get('/api/app/wechat/config')
def public_config(db: Session = Depends(get_db)):
    cfg = configuration(db)
    return ok({'enabled': ready(cfg), 'app_id': cfg['app_id'], 'android_package': cfg['android_package'], 'android_signature': cfg['android_signature']})


@router.get('/api/app/wechat/privacy')
def privacy(db: Session = Depends(get_db)):
    return ok({'content': configuration(db)['privacy_policy']})


def throttle(request, action):
    if not ratelimit.check_and_record(f'appwx:{action}:{ratelimit.client_ip(request)}', 20, 60):
        raise HTTPException(429, '操作过于频繁，请稍后再试')


@router.post('/api/app/wechat/challenge')
def challenge(request: Request, db: Session = Depends(get_db)):
    throttle(request, 'challenge')
    cfg = configuration(db)
    if not ready(cfg):
        raise HTTPException(503, 'APP 微信登录尚未开启')
    # 短命挑战共用数据库，API 多 worker 仍能防重放；不记录 code 或微信 access_token。
    state, proof = secrets.token_hex(16), secrets.token_urlsafe(32)
    db.query(Setting).filter(Setting.key.like('appwx:%'), Setting.updated_at < datetime.utcnow() - timedelta(minutes=10)).delete(synchronize_session=False)
    db.add(Setting(key='appwx:' + state, value=json.dumps({'proof': hashlib.sha256(proof.encode()).hexdigest(), 'expires': int(time.time()) + 300, 'app_id': cfg['app_id']})))
    db.commit()
    return ok({'state': state, 'proof': proof})


class LoginIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    code: str = Field(min_length=1, max_length=512)
    state: str = Field(min_length=1, max_length=64)
    proof: str = Field(min_length=1, max_length=128)


def exchange_code(cfg, code):
    try:
        response = httpx.get('https://api.weixin.qq.com/sns/oauth2/access_token', params={
            'appid': cfg['app_id'], 'secret': cfg['app_secret'], 'code': code, 'grant_type': 'authorization_code',
        }, timeout=15)
        response.raise_for_status()
        result = response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(503, '微信登录服务网络异常，请重试') from None
    if not isinstance(result, dict) or result.get('errcode') or not result.get('openid'):
        raise HTTPException(400, '微信授权凭证无效或已过期，请重新登录')
    return result


@router.post('/api/app/wechat/login')
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    throttle(request, 'login')
    cfg = configuration(db)
    if not ready(cfg):
        raise HTTPException(503, 'APP 微信登录尚未开启')
    if not re.fullmatch(r'[a-f0-9]{32}', body.state):
        raise HTTPException(400, '登录校验已失效，请重试')
    row = db.get(Setting, 'appwx:' + body.state)
    record = json.loads(row.value) if row else {}
    proof_hash = hashlib.sha256(body.proof.encode()).hexdigest()
    if not record or record.get('expires', 0) < time.time() or record.get('app_id') != cfg['app_id'] or not hmac.compare_digest(record.get('proof', ''), proof_hash):
        raise HTTPException(400, '登录校验已失效，请重试')
    # 条件删除是真正的一次性消费：并发请求仅一个成功，外部换码前提交。
    consumed = db.query(Setting).filter(Setting.key == row.key, Setting.value == row.value).delete(synchronize_session=False)
    db.commit()
    if consumed != 1:
        raise HTTPException(400, '登录校验已失效，请重试')
    identity = exchange_code(cfg, body.code)
    # 不占用网站/小程序 OpenID 字段；同一开放平台 unionid 沿用既有账号合并。
    openid = 'app:' + hashlib.sha256((cfg['app_id'] + ':' + identity['openid']).encode()).hexdigest()[:56]
    unionid = str(identity.get('unionid') or '')
    user = resolve_login(db, unionid, openid=openid)
    if user is None:
        user = User(openid=openid, unionid=unionid, nickname=_default_nickname())
        db.add(user)
        from sqlalchemy.exc import IntegrityError
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            user = resolve_login(db, unionid, openid=openid)
            if user is None:
                raise HTTPException(409, '账号状态已变化，请重新登录') from None
        db.refresh(user)
    return ok({'token': create_user_token(user.id), 'user': _user_dict(user)})
