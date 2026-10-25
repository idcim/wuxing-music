import base64
import hashlib
import hmac
import json
import subprocess
import tempfile
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import HTTPException

from app.config import settings
from .models import MediaAsset

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
    allowed = {"video": {".mp4", ".mov", ".mkv"}, "audio": {".mp3", ".wav", ".m4a"}}
    if kind not in allowed or ext not in allowed[kind]:
        raise HTTPException(422, "不支持的课程媒体格式")
    key = "course/source/" + uuid.uuid4().hex + ext
    asset = MediaAsset(kind=kind, name=name, source_key=key)
    db.add(asset)
    db.commit()
    policy = {"expiration": (datetime.utcnow() + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
              "conditions": [["eq", "$key", key], ["eq", "$x-oss-object-acl", "private"], ["content-length-range", 1, MAX_SIZE]]}
    encoded = base64.b64encode(json.dumps(policy).encode()).decode()
    endpoint = settings.commerce_private_endpoint.replace("https://", "").replace("http://", "").rstrip("/")
    return {"id": asset.id, "host": f"https://{settings.commerce_private_bucket}.{endpoint}", "fields": {
        "key": key, "policy": encoded, "OSSAccessKeyId": settings.commerce_private_key_id,
        "Signature": base64.b64encode(hmac.new(settings.commerce_private_key_secret.encode(), encoded.encode(), hashlib.sha1).digest()).decode(),
        "x-oss-object-acl": "private", "success_action_status": "200"}}


def signed_url(asset):
    store = bucket()
    if store.get_object_acl(asset.playback_key).acl not in ("private", "default"):
        raise HTTPException(409, "课件对象访问权限异常")
    return store.sign_url("GET", asset.playback_key, 900)


def process(db, asset_id):
    asset = db.get(MediaAsset, asset_id)
    if not asset or asset.state == "ready":
        return
    store = bucket()
    metadata = store.head_object(asset.source_key)
    if metadata.content_length > MAX_SIZE:
        raise RuntimeError("媒体超过 2GB")
    if store.get_object_acl(asset.source_key).acl not in ("private", "default"):
        raise RuntimeError("课件源对象不是私有")
    with tempfile.TemporaryDirectory(prefix="course-") as folder:
        source = str(Path(folder) / ("source" + Path(asset.source_key).suffix))
        target = str(Path(folder) / ("play.mp4" if asset.kind == "video" else "play.m4a"))
        import oss2
        oss2.resumable_download(store, asset.source_key, source)
        probe = subprocess.run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", source],
                               check=True, capture_output=True, text=True, timeout=90)
        info = json.loads(probe.stdout)
        duration = int(float(info["format"]["duration"]))
        if not 0 < duration <= 86400:
            raise RuntimeError("媒体时长不合法")
        command = ["ffmpeg", "-nostdin", "-y", "-v", "error", "-threads", "2", "-i", source]
        if asset.kind == "video":
            command += ["-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "23"]
        else:
            command += ["-map", "0:a:0", "-vn"]
        command += ["-c:a", "aac", "-b:a", "160k", "-threads", "2", "-movflags", "+faststart", target]
        subprocess.run(command, check=True, capture_output=True, timeout=1800)
        key = "course/play/" + uuid.uuid4().hex + Path(target).suffix
        oss2.resumable_upload(store, key, target, headers={"x-oss-object-acl": "private"})
        asset.playback_key, asset.duration, asset.size, asset.state, asset.error = key, duration, metadata.content_length, "ready", ""
        db.commit()
