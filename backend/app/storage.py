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
from datetime import datetime
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
    """保存字节内容，返回 {url, full_url}。base_url 仅本地存储用于拼 full_url。"""
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
                with open(abs_path, "rb") as f:
                    bucket.put_object(key, f.read())
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
