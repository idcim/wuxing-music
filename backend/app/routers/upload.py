import json
import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Admin, Setting
from app.schemas import ok
from app.security import get_current_admin

router = APIRouter(prefix="/api/admin/upload", tags=["upload"])

STORAGE_KEY = "storage_config"
UPLOAD_DIR = "uploads"
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".mp3", ".m4a", ".wav"}
MAX_BYTES = 20 * 1024 * 1024  # 20MB


def _storage_cfg(db: Session) -> dict:
    row = db.query(Setting).filter(Setting.key == STORAGE_KEY).first()
    return json.loads(row.value) if row and row.value else {}


@router.post("")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型：{ext}")

    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="文件超过 20MB 限制")

    cfg = _storage_cfg(db)
    provider = cfg.get("provider", "local")

    if provider == "oss":
        # OSS 上传预留：需配置 oss2 与密钥后实现
        raise HTTPException(status_code=501, detail="OSS 上传尚未启用，请切换为本地存储或补全 OSS 配置")

    # 本地存储：按日期分目录
    subdir = datetime.utcnow().strftime("%Y%m")
    dest_dir = os.path.join(UPLOAD_DIR, subdir)
    os.makedirs(dest_dir, exist_ok=True)
    name = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(dest_dir, name)
    with open(path, "wb") as f:
        f.write(content)

    # 返回可访问 URL（静态挂载在 /uploads）
    rel = f"/uploads/{subdir}/{name}"
    base = str(request.base_url).rstrip("/")
    return ok({"url": rel, "full_url": f"{base}{rel}"})
