from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Admin, Element
from app.schemas import ok
from app.security import get_current_admin
from pydantic import BaseModel

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
    sort: int = 0


def _to_dict(e: Element) -> dict:
    return {c.name: getattr(e, c.name) for c in Element.__table__.columns}


@router.get("")
def list_elements(db: Session = Depends(get_db), _: Admin = Depends(get_current_admin)):
    rows = db.query(Element).order_by(Element.sort).all()
    return ok([_to_dict(e) for e in rows])


@router.post("")
def upsert_element(
    body: ElementIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
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
    _: Admin = Depends(get_current_admin),
):
    e = db.query(Element).filter(Element.id == element_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="元素不存在")
    db.delete(e)
    db.commit()
    return ok()
