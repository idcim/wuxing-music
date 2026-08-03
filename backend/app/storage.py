"""文件存储抽象层：本地磁盘 / 阿里云 OSS。

后台「存储设置」(storage_config) 决定 provider：
  - local：写入 ./uploads，静态托管在 /uploads
  - oss：用 oss2 上传到阿里云 OSS，URL 走 oss_base_url（自定义域名/CDN）或默认 bucket 域名

对外统一接口：
  save_bytes(content, ext) -> {"url": <可存库的相对/绝对地址>, "full_url": <可直接访问的完整地址>}
本地返回相对路径 /uploads/...（前端 resolveUrl 补全）；OSS 直接返回完整 URL。
"""
import json
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Setting

STORAGE_KEY = "storage_config"
UPLOAD_DIR = "uploads"


def get_storage_cfg(db: Session) -> dict:
    row = db.query(Setting).filter(Setting.key == STORAGE_KEY).first()
    return json.loads(row.value) if row and row.value else {}


def _object_key(ext: str) -> str:
    """对象键：按年月分目录 + uuid 文件名。"""
    subdir = datetime.utcnow().strftime("%Y%m")
    return f"{subdir}/{uuid.uuid4().hex}{ext}"


# ── 阿里云 OSS ──
def _oss_bucket(cfg: dict):
    """构造 oss2 Bucket 对象；缺包或缺配置时抛错（调用方转 HTTP 错误）。"""
    try:
        import oss2  # 延迟导入：本地存储场景无需安装 oss2
    except ImportError as e:  # pragma: no cover
        raise RuntimeError("未安装 oss2，请在后端 requirements 安装后重试") from e

    key_id = cfg.get("oss_access_key_id")
    key_secret = cfg.get("oss_access_key_secret")
    endpoint = cfg.get("oss_endpoint")
    bucket_name = cfg.get("oss_bucket")
    if not all([key_id, key_secret, endpoint, bucket_name]):
        raise RuntimeError("OSS 配置不完整（endpoint/bucket/accessKey）")

    auth = oss2.Auth(key_id, key_secret)
    return oss2.Bucket(auth, endpoint, bucket_name)


def _oss_public_url(cfg: dict, key: str) -> str:
    """优先用自定义域名/CDN（oss_base_url），否则用 bucket.endpoint 默认域名。"""
    base = (cfg.get("oss_base_url") or "").rstrip("/")
    if base:
        return f"{base}/{key}"
    # 默认：https://{bucket}.{endpoint-without-scheme}/{key}
    endpoint = cfg.get("oss_endpoint", "")
    host = endpoint.replace("https://", "").replace("http://", "").rstrip("/")
    return f"https://{cfg.get('oss_bucket')}.{host}/{key}"


def save_bytes(db: Session, content: bytes, ext: str, base_url: str = "") -> dict:
    """保存字节内容，返回 {url, full_url}。base_url 仅本地存储用于拼 full_url。

    小文件（头像/封面）用这个即可；音频等大文件请用 save_stream，避免整包驻留内存。
    """
    cfg = get_storage_cfg(db)
    provider = cfg.get("provider", "local")
    key = _object_key(ext)

    if provider == "oss":
        bucket = _oss_bucket(cfg)
        bucket.put_object(key, content)
        url = _oss_public_url(cfg, key)
        return {"url": url, "full_url": url}

    # 本地存储
    dest_dir = os.path.join(UPLOAD_DIR, os.path.dirname(key))
    os.makedirs(dest_dir, exist_ok=True)
    with open(os.path.join(UPLOAD_DIR, key), "wb") as f:
        f.write(content)
    rel = f"/uploads/{key}"
    base = (base_url or "").rstrip("/")
    return {"url": rel, "full_url": f"{base}{rel}" if base else rel}


CHUNK = 1024 * 1024  # 1MB


def build_oss_post_policy(db: Session, ext: str, max_bytes: int) -> dict:
    """生成 OSS 直传（PostObject）所需的签名参数。

    大文件（曲目 WAV 可达数百 MB）不该经服务器中转——那要占一份带宽、一份内存、
    一份磁盘，还受 nginx body 上限约束。直传由浏览器把文件直接 PUT 到 OSS，
    服务端只负责签一张限定了对象键与体积的「准入条」。

    返回字段与 OSS PostObject 表单一一对应，前端按此拼 FormData。
    """
    import base64
    import hmac
    import json as _json
    from hashlib import sha1

    cfg = get_storage_cfg(db)
    # 未配 OSS 不算错误：调用方据 provider 回退到服务器中转上传，
    # 抛异常会让后台弹一条没必要的红字提示。
    if cfg.get("provider") != "oss":
        return {"provider": "local"}

    key_id = cfg.get("oss_access_key_id")
    key_secret = cfg.get("oss_access_key_secret")
    endpoint = cfg.get("oss_endpoint")
    bucket_name = cfg.get("oss_bucket")
    if not all([key_id, key_secret, endpoint, bucket_name]):
        raise RuntimeError("OSS 配置不完整（endpoint/bucket/accessKey）")

    key = _object_key(ext)
    expire_at = datetime.utcnow() + timedelta(minutes=30)
    policy = {
        "expiration": expire_at.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "conditions": [
            # 锁死对象键：客户端不能改传到别的路径去
            ["eq", "$key", key],
            ["content-length-range", 0, max_bytes],
        ],
    }
    policy_b64 = base64.b64encode(
        _json.dumps(policy).encode("utf-8")
    ).decode("utf-8")
    signature = base64.b64encode(
        hmac.new(key_secret.encode("utf-8"), policy_b64.encode("utf-8"), sha1).digest()
    ).decode("utf-8")

    host = endpoint.replace("https://", "").replace("http://", "").rstrip("/")
    return {
        "provider": "oss",
        "host": f"https://{bucket_name}.{host}",
        "key": key,
        "policy": policy_b64,
        "signature": signature,
        "OSSAccessKeyId": key_id,
        # 直传成功后可直接入库的地址（含自定义域名/CDN 规则）
        "url": _oss_public_url(cfg, key),
        "maxBytes": max_bytes,
    }


async def save_stream(
    db: Session,
    upload,                    # fastapi.UploadFile
    ext: str,
    max_bytes: int,
    base_url: str = "",
) -> dict:
    """分块保存上传文件，返回 {url, full_url}；超过 max_bytes 抛 ValueError。

    与 save_bytes 的区别：**不把整个文件读进内存**。曲目音频可达数百 MB，
    `await file.read()` 那种写法会让进程 RSS 直接顶到文件大小，
    而且是先吃满内存、再去比对上限——超限的请求反而最伤。
    这里边读边写、边累计，一超限立刻中断并清掉半截文件。
    """
    cfg = get_storage_cfg(db)
    provider = cfg.get("provider", "local")
    key = _object_key(ext)
    total = 0

    if provider == "oss":
        # OSS 分片上传：同样不整包进内存。
        # 注意：真正的大文件建议走前端直传（见 /api/admin/upload/oss-sign），
        # 这里是后台中转路径的兜底。
        bucket = _oss_bucket(cfg)
        upload_id = bucket.init_multipart_upload(key).upload_id
        parts = []
        try:
            import oss2
            part_number = 1
            while True:
                chunk = await upload.read(CHUNK)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise ValueError("文件超过大小限制")
                result = bucket.upload_part(key, upload_id, part_number, chunk)
                parts.append(oss2.models.PartInfo(part_number, result.etag))
                part_number += 1
            bucket.complete_multipart_upload(key, upload_id, parts)
        except Exception:
            try:
                bucket.abort_multipart_upload(key, upload_id)
            except Exception:
                pass
            raise
        url = _oss_public_url(cfg, key)
        return {"url": url, "full_url": url}

    # 本地存储：边读边写
    dest_dir = os.path.join(UPLOAD_DIR, os.path.dirname(key))
    os.makedirs(dest_dir, exist_ok=True)
    path = os.path.join(UPLOAD_DIR, key)
    try:
        with open(path, "wb") as f:
            while True:
                chunk = await upload.read(CHUNK)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise ValueError("文件超过大小限制")
                f.write(chunk)
    except Exception:
        # 超限/中断都要清掉半截文件，别在磁盘上留垃圾
        try:
            os.remove(path)
        except OSError:
            pass
        raise

    rel = f"/uploads/{key}"
    base = (base_url or "").rstrip("/")
    return {"url": rel, "full_url": f"{base}{rel}" if base else rel}


# ── 本地 → OSS 迁移 ──
def migrate_local_to_oss(db: Session) -> dict:
    """把 ./uploads 下所有文件上传到 OSS，保持相对路径为对象键。
    不删除本地文件（安全起见）。返回 {migrated, failed: [...], mapping: {本地相对路径: OSS URL}}。
    """
    cfg = get_storage_cfg(db)
    if cfg.get("provider") != "oss":
        raise RuntimeError("当前存储不是 OSS，请先把存储设置切换为 OSS 并保存")

    bucket = _oss_bucket(cfg)
    migrated = 0
    failed: list[str] = []
    mapping: dict[str, str] = {}

    if not os.path.isdir(UPLOAD_DIR):
        return {"migrated": 0, "failed": [], "mapping": {}}

    for root, _dirs, files in os.walk(UPLOAD_DIR):
        for fname in files:
            abs_path = os.path.join(root, fname)
            # 对象键 = 相对 uploads 的路径（统一用正斜杠）
            key = os.path.relpath(abs_path, UPLOAD_DIR).replace(os.sep, "/")
            rel_url = f"/uploads/{key}"
            try:
                # 用 resumable_upload：内部分片，不把整个文件读进内存。
                # 迁移的正是曲目音频，单个可达数百 MB，f.read() 会直接顶爆进程。
                import oss2
                oss2.resumable_upload(
                    bucket, key, abs_path,
                    multipart_threshold=CHUNK * 5,
                    part_size=CHUNK * 5,
                )
                mapping[rel_url] = _oss_public_url(cfg, key)
                migrated += 1
            except Exception:  # noqa: BLE001
                failed.append(rel_url)

    return {"migrated": migrated, "failed": failed, "mapping": mapping}


def rewrite_db_urls(db: Session, mapping: dict) -> int:
    """把数据库中引用旧本地 URL 的字段改写为新的 OSS URL。
    覆盖：track.audio_url/cover_url、user.avatar、site_config.logo_url。
    返回改写的记录数。
    """
    from app.models import Track, User

    if not mapping:
        return 0
    changed = 0

    # 曲目音频/封面
    for t in db.query(Track).all():
        hit = False
        if t.audio_url in mapping:
            t.audio_url = mapping[t.audio_url]
            hit = True
        if t.cover_url in mapping:
            t.cover_url = mapping[t.cover_url]
            hit = True
        if hit:
            changed += 1

    # 用户头像
    for u in db.query(User).all():
        if u.avatar in mapping:
            u.avatar = mapping[u.avatar]
            changed += 1

    # 站点 logo
    site_row = db.query(Setting).filter(Setting.key == "site_config").first()
    if site_row and site_row.value:
        site_cfg = json.loads(site_row.value)
        logo = site_cfg.get("logo_url")
        if logo in mapping:
            site_cfg["logo_url"] = mapping[logo]
            site_row.value = json.dumps(site_cfg, ensure_ascii=False)
            changed += 1

    db.commit()
    return changed


# 允许的扩展名（供路由复用）
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}
AUDIO_EXT = {".mp3", ".m4a", ".wav"}
ALL_EXT = IMAGE_EXT | AUDIO_EXT


def ext_of(filename: Optional[str]) -> str:
    return os.path.splitext(filename or "")[1].lower()
