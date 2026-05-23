from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from app import storage
from app.database import get_db
from app.models import Admin
from app.schemas import ok
from app.security import get_current_admin

router = APIRouter(prefix="/api/admin/upload", tags=["upload"])

MAX_BYTES = 50 * 1024 * 1024  # 50MB（音频文件较大）


@router.post("")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    ext = storage.ext_of(file.filename)
    if ext not in storage.ALL_EXT:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型：{ext}")

    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="文件超过 50MB 限制")

    try:
        result = storage.save_bytes(db, content, ext, base_url=str(request.base_url))
    except RuntimeError as e:
        # OSS 配置缺失/未装包等
        raise HTTPException(status_code=400, detail=str(e))
    return ok(result)
