import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Admin, Element
from app.schemas import ok
from app.security import require_perm
from pydantic import BaseModel, field_validator

router = APIRouter(prefix="/api/admin/elements", tags=["elements"])


class ElementIn(BaseModel):
    id: str
    en: str
    icon: str = ""
    primary: str
    accent: str
    glow: str
    bg: str = ""
    note: str
    note_pinyin: str
    organ: str
    season: str
    quality: str
    desc: str = ""
    sleep_tip: str = ""
    # 文化对照维度，后台是一个自由编辑的 JSON 文本框，这里挡一道格式
    meta: str = "{}"
    sort: int = 0

    @field_validator("meta")
    @classmethod
    def _valid_meta(cls, v: str) -> str:
        v = (v or "").strip() or "{}"
        try:
            obj = json.loads(v)
        except ValueError:
            raise ValueError("meta 不是合法 JSON")
        if not isinstance(obj, dict):
            raise ValueError("meta 必须是 JSON 对象")
        # 存回紧凑形式，免得后台粘进来一大坨缩进
        return json.dumps(obj, ensure_ascii=False)


def _to_dict(e: Element) -> dict:
    return {c.name: getattr(e, c.name) for c in Element.__table__.columns}


@router.get("")
def list_elements(db: Session = Depends(get_db), _: Admin = Depends(require_perm("elements:view"))):
    rows = db.query(Element).order_by(Element.sort).all()
    return ok([_to_dict(e) for e in rows])


@router.post("")
def upsert_element(
    body: ElementIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("elements:edit")),
):
    e = db.query(Element).filter(Element.id == body.id).first()
    if e:
        for k, v in body.model_dump().items():
            setattr(e, k, v)
    else:
        e = Element(**body.model_dump())
        db.add(e)
    db.commit()
    db.refresh(e)
    return ok(_to_dict(e))


@router.delete("/{element_id}")
def delete_element(
    element_id: str,
    db: Session = Depends(get_db),
    _: Admin = Depends(require_perm("elements:edit")),
):
    e = db.query(Element).filter(Element.id == element_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="元素不存在")
    db.delete(e)
    db.commit()
    return ok()
