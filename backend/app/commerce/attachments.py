"""售后图片不放公开 uploads；短时签名读取，数据库保存逻辑引用。"""
import io
import os
import re
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from jose import JWTError, jwt
from PIL import Image
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.routers.mp import get_current_user
from .common import ok, ready, require_row, throttle
from .models import Attachment

PRIVATE_DIR = Path(os.getenv("COMMERCE_PRIVATE_DIR", "private-commerce"))
router = APIRouter(prefix="/api/mp/v2", dependencies=[Depends(ready)])


def image_url(ident, base=""):
    token = jwt.encode({"purpose": "commerce-image", "id": ident, "exp": datetime.utcnow() + timedelta(minutes=15)},
                       settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return (base or settings.commerce_public_base).rstrip("/") + f"/api/mp/v2/attachments/{ident}?token={token}"


def normalize(db, uid, urls):
    result = []
    for url in urls:
        match = re.search(r"(?:attachment:|/attachments/)(\d+)", url)
        if not match:
            raise HTTPException(422, "请使用售后上传的图片")
        attachment = require_row(db, Attachment, int(match[1]))
        if attachment.user_id != uid:
            raise HTTPException(403, "不能使用他人的售后图片")
        result.append(f"attachment:{attachment.id}")
    return result


def sale_dict(sale):
    from .common import serialize
    row = serialize(sale)
    row["images"] = [image_url(int(value.split(":")[1])) for value in sale.images if value.startswith("attachment:")]
    return row


@router.post("/aftersales/images")
async def upload_image(request: Request, file: UploadFile = File(...), user=Depends(get_current_user), db: Session = Depends(get_db)):
    throttle(user.id, "evidence", 12)
    content = await file.read(5 * 1024 * 1024 + 1)
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(413, "图片不能超过 5MB")
    try:
        with Image.open(io.BytesIO(content)) as original:
            if original.width * original.height > 20_000_000:
                raise ValueError()
            converted = original.convert("RGB")
            output = io.BytesIO()
            converted.save(output, format="JPEG", quality=88)
    except Exception as exc:
        raise HTTPException(422, "图片格式或尺寸不合法") from exc
    key = uuid.uuid4().hex + ".jpg"
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    (PRIVATE_DIR / key).write_bytes(output.getvalue())
    row = Attachment(user_id=user.id, key=key)
    db.add(row)
    db.commit()
    return ok({"id": row.id, "url": image_url(row.id, str(request.base_url))})


@router.get("/attachments/{ident}")
def read_image(ident: int, token: str, db: Session = Depends(get_db)):
    try:
        claim = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if claim.get("purpose") != "commerce-image" or claim.get("id") != ident:
            raise ValueError()
    except (JWTError, ValueError) as exc:
        raise HTTPException(403, "图片访问已过期") from exc
    row = require_row(db, Attachment, ident)
    path = PRIVATE_DIR / row.key
    if not path.is_file() or path.parent.resolve() != PRIVATE_DIR.resolve():
        raise HTTPException(404)
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "private, no-store"})
