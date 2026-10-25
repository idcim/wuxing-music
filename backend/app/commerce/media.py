import base64
import hashlib
import hmac
import json
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import HTTPException

from app.config import settings
from .models import Job, MediaAsset
from .common import guard_claim, record

MAX_SIZE = 2 * 1024**3


def bucket():
    import oss2
    if not all([settings.commerce_private_bucket, settings.commerce_private_endpoint,
                settings.commerce_private_key_id, settings.commerce_private_key_secret]):
        raise HTTPException(409, "请先配置独立的私有课程 OSS 桶")
    endpoint = settings.commerce_private_endpoint
    if endpoint.startswith("http://"):
        raise HTTPException(409, "私有课件存储必须使用 HTTPS")
    if not endpoint.startswith("https://"):
        endpoint = "https://" + endpoint
    result = oss2.Bucket(oss2.Auth(settings.commerce_private_key_id, settings.commerce_private_key_secret),
                        endpoint, settings.commerce_private_bucket)
    if result.get_bucket_acl().acl != "private":
        raise HTTPException(409, "课件桶必须为 private，不能使用公开音乐桶")
    return result


def upload_policy(db, name, kind):
    bucket()  # 签发前验证桶 ACL，而不是相信后台勾选。
    ext = Path(name).suffix.lower()
    allowed = {"video": {".mp4"}, "audio": {".mp3", ".wav", ".m4a"}}
    if kind not in allowed or ext not in allowed[kind]:
        raise HTTPException(422, "不支持的课程媒体格式")
    key = "course/source/" + uuid.uuid4().hex + ext
    asset = MediaAsset(kind=kind, name=name, source_key=key)
    db.add(asset)
    db.commit()
    policy = {"expiration": (datetime.utcnow() + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
              "conditions": [["eq", "$key", key], ["eq", "$x-oss-object-acl", "private"],
                             ["eq", "$x-oss-forbid-overwrite", "true"], ["content-length-range", 1, MAX_SIZE]]}
    encoded = base64.b64encode(json.dumps(policy).encode()).decode()
    endpoint = settings.commerce_private_endpoint.replace("https://", "").replace("http://", "").rstrip("/")
    return {"id": asset.id, "host": f"https://{settings.commerce_private_bucket}.{endpoint}", "fields": {
        "key": key, "policy": encoded, "OSSAccessKeyId": settings.commerce_private_key_id,
        "Signature": base64.b64encode(hmac.new(settings.commerce_private_key_secret.encode(), encoded.encode(), hashlib.sha1).digest()).decode(),
        "x-oss-object-acl": "private", "x-oss-forbid-overwrite": "true", "success_action_status": "200"}}


def signed_url(asset):
    store = bucket()
    if store.get_object_acl(asset.playback_key).acl not in ("private", "default"):
        raise HTTPException(409, "课件对象访问权限异常")
    return store.sign_url("GET", asset.playback_key, 900)


def complete_original(db, asset_id, duration):
    # 与旧 Worker 按相同顺序锁定任务；终止旧租约，迟到结果不能覆盖原文件。
    job = db.query(Job).filter_by(key=f"media:{asset_id}").populate_existing().with_for_update().first()
    asset = db.query(MediaAsset).filter_by(id=asset_id).populate_existing().with_for_update().one()
    if asset.state == "ready":
        return asset
    allowed = {"video": {".mp4"}, "audio": {".mp3", ".wav", ".m4a"}}
    if Path(asset.source_key).suffix.lower() not in allowed.get(asset.kind, set()):
        raise HTTPException(409, "已停用转码，请上传可直接播放的 MP4 视频或 MP3/M4A/WAV 音频")
    store = bucket()
    metadata = store.head_object(asset.source_key)
    if not 0 < metadata.content_length <= MAX_SIZE:
        raise HTTPException(422, "上传文件大小无效")
    if store.get_object_acl(asset.source_key).acl not in ("private", "default"):
        raise HTTPException(409, "课件源对象不是私有")
    asset.playback_key, asset.duration, asset.size = asset.source_key, duration, metadata.content_length
    asset.state, asset.error = "ready", ""
    if job and job.state != "done":
        record(db, f"job:{job.id}", "transcoding_stopped", {"previous_state": job.state, "previous_error": job.error})
        job.state, job.lease_until, job.error = "done", None, ""
    record(db, f"media:{asset.id}", "original_ready", {"duration": duration, "size": asset.size})
    db.commit()
    return asset


def process(db, asset_id):
    """仅收尾旧的排队任务，不下载、探测或转换媒体。"""
    guard_claim(db)
    asset = db.get(MediaAsset, asset_id)
    if asset and asset.state != "ready":
        asset.state = "uploading"
        asset.error = "自动转码已停用；原文件保留在 OSS，请确认格式和时长后使用原文件"
        record(db, f"media:{asset.id}", "transcoding_stopped")
        db.commit()
