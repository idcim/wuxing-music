"""APP 配置、独立版本记录与匿名下载。每条记录独立存储，无表结构迁移。"""
import json
import uuid
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app import app_packages, storage
from app.database import get_db
from app.models import Setting
from app.schemas import ok
from app.security import require_perm

router = APIRouter(tags=['app-management'])
CONFIG = 'app_config'


def read(db, key, default=None):
    row = db.get(Setting, key)
    return json.loads(row.value) if row and row.value else default


def write(db, key, data):
    row = db.get(Setting, key)
    if row:
        row.value = json.dumps(data, ensure_ascii=False)
    else:
        db.add(Setting(key=key, value=json.dumps(data, ensure_ascii=False)))


def lock_config(db):
    return db.query(Setting).filter(Setting.key == CONFIG).with_for_update().populate_existing().first()


def audit(db, action, rid, actor):
    write(db, 'app_audit_' + uuid.uuid4().hex, dict(action=action, release_id=rid,
          actor=getattr(actor, 'username', ''), at=datetime.utcnow().isoformat()))


class AppConfig(BaseModel):
    enabled: bool = False
    app_name: str = Field(default='', max_length=80)
    android_package: str = Field(default='cn.azureglow.wuxing.preview', pattern=r'^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)+$', max_length=180)
    title: str = Field(default='随时聆听，安放心绪', max_length=120)
    description: str = Field(default='音乐、课程与东方生活，在这里相遇。', max_length=2000)
    install_guide: str = Field(default='下载后打开 APK，按 Android 系统提示允许本次安装。\n微信内请使用右上角菜单，在浏览器中打开本页。', max_length=6000)
    ios_store_url: str = Field(default='', max_length=500)

    @field_validator('ios_store_url')
    @classmethod
    def ios_url(cls, value):
        from urllib.parse import urlparse
        p = urlparse(value)
        if value and (p.scheme != 'https' or p.hostname != 'apps.apple.com' or p.username or p.password):
            raise ValueError('iOS 下载地址应为 https://apps.apple.com 的应用商店地址')
        return value


def config(db):
    data = AppConfig(**(read(db, CONFIG, {}) or {})).model_dump()
    site = read(db, 'site_config', {}) or {}
    data['app_name'] = data['app_name'] or site.get('site_name') or '五行律音'
    return data


@router.get('/api/admin/apps/config')
def get_config(db: Session = Depends(get_db), _=Depends(require_perm('apps:view'))):
    return ok(config(db))


@router.put('/api/admin/apps/config')
def save_config(body: AppConfig, db: Session = Depends(get_db), _=Depends(require_perm('apps:edit'))):
    lock_config(db)
    write(db, CONFIG, body.model_dump())
    audit(db, 'save_config', '', _)
    db.commit()
    return ok(config(db))


class PackageIn(BaseModel):
    filename: str = Field(max_length=255)


@router.post('/api/admin/apps/packages/sign')
def sign(body: PackageIn, db: Session = Depends(get_db), _=Depends(require_perm('apps:edit'))):
    cfg = storage.get_storage_cfg(db)
    try:
        ticket = app_packages.sign_package(cfg, body.filename)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    asset_id = uuid.uuid4().hex
    write(db, 'app_asset_' + asset_id, dict(asset_id=asset_id, key=ticket['key'], ready=False,
          bucket=cfg['oss_bucket'], endpoint=cfg['oss_endpoint'], expires_at=(datetime.utcnow() + timedelta(hours=2)).isoformat()))
    db.commit()
    return ok({'asset_id': asset_id, 'host': ticket['host'], 'fields': ticket['fields']})


@router.post('/api/admin/apps/packages/{asset_id}/complete')
def complete(asset_id: str, db: Session = Depends(get_db), _=Depends(require_perm('apps:edit'))):
    asset = read(db, 'app_asset_' + asset_id)
    if not asset:
        raise HTTPException(404, '上传记录不存在')
    if not asset.get('ready'):
        if datetime.fromisoformat(asset['expires_at']) < datetime.utcnow():
            raise HTTPException(400, '上传凭据已过期，请重新上传')
        try:
            metadata = app_packages.verify_package(db, asset)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        except Exception:
            raise HTTPException(502, 'OSS 安装包校验失败，请确认上传完成后重试')
        asset.update(metadata, ready=True)
        write(db, 'app_asset_' + asset_id, asset)
        db.commit()
    return ok({k: asset[k] for k in ('asset_id', 'version_name', 'version_code', 'package_name', 'size', 'sha256')})


class ReleaseEdit(BaseModel):
    channel: Literal['preview', 'stable'] = 'preview'
    notes: str = Field(default='', max_length=12000)
    force_update: bool = False
    min_supported_code: int = Field(default=0, ge=0, le=2100000000)


class ReleaseIn(ReleaseEdit):
    asset_id: str = Field(max_length=64)


def releases(db, locked=False):
    query = db.query(Setting).filter(Setting.key.startswith('app_release_', autoescape=True))
    if locked:
        query = query.with_for_update().populate_existing()
    rows = query.all()
    return sorted([json.loads(row.value) for row in rows], key=lambda r: (r['version_code'], r['created_at']), reverse=True)


@router.get('/api/admin/apps/releases')
def list_releases(db: Session = Depends(get_db), _=Depends(require_perm('apps:view'))):
    return ok(releases(db))


@router.post('/api/admin/apps/releases')
def create_release(body: ReleaseIn, db: Session = Depends(get_db), _=Depends(require_perm('apps:edit'))):
    asset = read(db, 'app_asset_' + body.asset_id)
    if not asset or not asset.get('ready'):
        raise HTTPException(400, '请先上传并完成安装包校验')
    if asset['package_name'] != config(db)['android_package']:
        raise HTTPException(400, 'APK 包名与基础配置不一致')
    if body.min_supported_code > asset['version_code']:
        raise HTTPException(400, '最低支持版本不能高于此版本')
    data = {k: asset[k] for k in ('version_name', 'version_code', 'package_name', 'size', 'sha256')}
    data.update(body.model_dump(), id=uuid.uuid4().hex, status='draft', created_at=datetime.utcnow().isoformat(), published_at=None)
    if not db.get(Setting, CONFIG):
        write(db, CONFIG, AppConfig().model_dump())
    write(db, 'app_release_' + data['id'], data)
    audit(db, 'create_draft', data['id'], _)
    db.commit()
    return ok(data)


def get_release(db, rid, locked=False):
    if locked:
        row = db.query(Setting).filter(Setting.key == 'app_release_' + rid).with_for_update().populate_existing().first()
        data = json.loads(row.value) if row else None
    else:
        data = read(db, 'app_release_' + rid)
    if not data:
        raise HTTPException(404, '版本不存在')
    return data


@router.put('/api/admin/apps/releases/{rid}')
def edit_release(rid: str, body: ReleaseEdit, db: Session = Depends(get_db), _=Depends(require_perm('apps:edit'))):
    lock_config(db)
    data = get_release(db, rid, locked=True)
    if data['status'] != 'draft':
        raise HTTPException(400, '只能修改草稿；请上传新版本后再发布')
    if body.min_supported_code > data['version_code']:
        raise HTTPException(400, '最低支持版本不能高于此版本')
    data.update(body.model_dump())
    write(db, 'app_release_' + rid, data)
    audit(db, 'edit_draft', rid, _)
    db.commit()
    return ok(data)


@router.post('/api/admin/apps/releases/{rid}/publish')
def publish_release(rid: str, db: Session = Depends(get_db), _=Depends(require_perm('apps:publish'))):
    # 同一配置行作为发布锁：MySQL 多进程并发发布也顺序检查 versionCode。
    lock_config(db)
    data = get_release(db, rid, locked=True)
    if data['status'] != 'draft':
        raise HTTPException(400, '只能发布草稿')
    if data['package_name'] != config(db)['android_package']:
        raise HTTPException(400, 'APK 包名与当前配置不一致')
    if any(r['channel'] == data['channel'] and r['package_name'] == data['package_name'] and
           r['published_at'] and r['version_code'] >= data['version_code'] for r in releases(db, locked=True)):
        raise HTTPException(400, '新版本的 versionCode 必须高于该渠道已经发布的版本')
    asset = read(db, 'app_asset_' + data['asset_id'])
    if not asset or not asset.get('ready'):
        raise HTTPException(400, '安装包校验记录不存在')
    data.update(status='published', published_at=datetime.utcnow().isoformat())
    write(db, 'app_release_' + rid, data)
    audit(db, 'publish', rid, _)
    db.commit()
    return ok(data)


@router.post('/api/admin/apps/releases/{rid}/withdraw')
def withdraw_release(rid: str, db: Session = Depends(get_db), _=Depends(require_perm('apps:publish'))):
    lock_config(db)
    data = get_release(db, rid, locked=True)
    if data['status'] != 'published':
        raise HTTPException(400, '只能撤回已发布版本')
    data.update(status='withdrawn')
    write(db, 'app_release_' + rid, data)
    audit(db, 'withdraw', rid, _)
    db.commit()
    return ok(data)


@router.get('/api/app/info')
def public_info(channel: Literal['preview', 'stable'] = 'preview', version_code: int = Query(0, ge=0, le=2100000000),
                package_name: str = '', db: Session = Depends(get_db)):
    cfg = config(db)
    latest = next((r for r in releases(db) if cfg['enabled'] and r['status'] == 'published' and r['channel'] == channel
                   and r['package_name'] == cfg['android_package'] and (not package_name or r['package_name'] == package_name)), None)
    available = bool(latest and version_code and latest['version_code'] > version_code)
    public = {k: v for k, v in latest.items() if k not in ('asset_id', 'force_update', 'min_supported_code')} if latest else None
    if public:
        public['download_url'] = '/api/app/download/' + latest['id']
    return ok({**cfg, 'latest': public, 'update_available': available,
               'force_update': bool(available and (latest['force_update'] or version_code < latest['min_supported_code']))})


@router.get('/api/app/download/{rid}')
def download(rid: str, db: Session = Depends(get_db)):
    cfg = config(db)
    data = get_release(db, rid)
    if not cfg['enabled'] or data['status'] != 'published' or data['package_name'] != cfg['android_package']:
        raise HTTPException(404, '此版本暂未开放下载')
    asset = read(db, 'app_asset_' + data['asset_id'])
    storage_cfg = storage.get_storage_cfg(db)
    if not asset or storage_cfg.get('oss_bucket') != asset['bucket'] or storage_cfg.get('oss_endpoint') != asset['endpoint']:
        raise HTTPException(503, '安装包存储暂不可用')
    try:
        bucket = storage._oss_bucket(storage_cfg)
        meta = bucket.head_object(asset['key'])
        if meta.etag != asset.get('etag') or meta.content_length != data['size']:
            raise HTTPException(503, '安装包已改变，请联系管理员重新上传发布')
        url = bucket.sign_url('GET', asset['key'], 300, params={
            'response-content-disposition': f'attachment; filename="wuxing-{data["version_code"]}.apk"',
            'response-content-type': app_packages.CONTENT_TYPE,
        }, slash_safe=True)
        if not url.startswith('https://'):
            raise HTTPException(503, '安装包存储必须使用 HTTPS')
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, '安装包暂不可用，请稍后重试')
    return RedirectResponse(url, status_code=302, headers={'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'})


# 页面单独模块渲染，避免应用下载依赖后台登录或 H5 SPA。
from app.app_download_page import render_download


@router.get('/download')
@router.get('/api/app/download-page')
def download_page(channel: Literal['preview', 'stable'] = 'preview', db: Session = Depends(get_db)):
    info = public_info(channel, 0, '', db)['data']
    return render_download(info, read(db, 'site_config', {}) or {}, read(db, 'theme_config', {}) or {})
