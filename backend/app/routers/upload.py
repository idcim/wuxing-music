from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import storage
from app.config import settings
from app.database import get_db
from app.models import Admin
from app.schemas import ok
from app.security import get_current_admin

router = APIRouter(prefix="/api/admin/upload", tags=["upload"])


@router.post("")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    """后台上传（曲目音频 / 封面 / LOGO 等）。

    分块落盘，不把整个文件读进内存——曲目 WAV 动辄上百 MB，
    旧写法先 `await file.read()` 再比对上限，超限请求反而最先把内存吃满。
    真正的大文件建议走 OSS 直传（POST /api/admin/upload/oss-sign），不经服务器中转。
    """
    ext = storage.ext_of(file.filename)
    if ext not in storage.ALL_EXT:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型：{ext}")

    max_bytes = settings.upload_max_mb * 1024 * 1024
    too_large = f"文件超过 {settings.upload_max_mb}MB 限制"

    # 有 Content-Length 就先快速拒绝，省得整包传完再报错
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > max_bytes:
        raise HTTPException(status_code=400, detail=too_large)

    try:
        result = await storage.save_stream(
            db, file, ext, max_bytes, base_url=str(request.base_url)
        )
    except ValueError:
        raise HTTPException(status_code=400, detail=too_large)
    except RuntimeError as e:
        # OSS 配置缺失/未装包等
        raise HTTPException(status_code=400, detail=str(e))
    return ok(result)


class OssSignIn(BaseModel):
    filename: str


@router.post("/oss-sign")
def oss_sign(
    body: OssSignIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    """为 OSS 直传签名。

    曲目 WAV 可达数百 MB，经服务器中转要多占一份带宽/内存/磁盘，还卡在 nginx
    body 上限上。直传让浏览器把文件直接送进 OSS，服务端只签一张限定了
    对象键与体积的准入条；OSS 本身原生支持 Range，正好供边下边播。
    """
    ext = storage.ext_of(body.filename)
    if ext not in storage.ALL_EXT:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型：{ext}")
    try:
        # 直传不经服务器，上限放宽到 2GB（仍由 policy 强制，客户端改不了）
        return ok(storage.build_oss_post_policy(db, ext, 2 * 1024 * 1024 * 1024))
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
