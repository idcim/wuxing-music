import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Admin, Plan
from app.schemas import PlanIn, ok
from app.security import get_current_admin

router = APIRouter(prefix="/api/admin/plans", tags=["plans"])


def _to_dict(p: Plan) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "en": p.en,
        "price": p.price,
        "original": p.original,
        "unit": p.unit,
        "badge": p.badge,
        "duration_days": p.duration_days,
        "features": json.loads(p.features or "[]"),
        "featured": p.featured,
        "is_active": p.is_active,
        "sort": p.sort,
    }


@router.get("")
def list_plans(db: Session = Depends(get_db), _: Admin = Depends(get_current_admin)):
    rows = db.query(Plan).order_by(Plan.sort).all()
    return ok([_to_dict(p) for p in rows])


@router.post("")
def upsert_plan(
    body: PlanIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    plan = db.query(Plan).filter(Plan.id == body.id).first()
    data = body.model_dump()
    data["features"] = json.dumps(body.features, ensure_ascii=False)
    if plan:
        for k, v in data.items():
            setattr(plan, k, v)
    else:
        plan = Plan(**data)
        db.add(plan)
    db.commit()
    db.refresh(plan)
    return ok(_to_dict(plan))


@router.delete("/{plan_id}")
def delete_plan(
    plan_id: str,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="套餐不存在")
    db.delete(plan)
    db.commit()
    return ok()
