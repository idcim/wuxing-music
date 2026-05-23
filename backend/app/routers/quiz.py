import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Admin, QuizQuestion
from app.schemas import QuizQuestionIn, ok
from app.security import get_current_admin

router = APIRouter(prefix="/api/admin/quiz", tags=["quiz"])


def _to_dict(q: QuizQuestion) -> dict:
    return {
        "id": q.id,
        "q": q.q,
        "options": json.loads(q.options or "[]"),
        "sort": q.sort,
        "is_active": q.is_active,
    }


@router.get("")
def list_questions(db: Session = Depends(get_db), _: Admin = Depends(get_current_admin)):
    rows = db.query(QuizQuestion).order_by(QuizQuestion.sort).all()
    return ok([_to_dict(q) for q in rows])


@router.post("")
def create_question(
    body: QuizQuestionIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    q = QuizQuestion(
        q=body.q,
        options=json.dumps(body.options, ensure_ascii=False),
        sort=body.sort,
        is_active=body.is_active,
    )
    db.add(q)
    db.commit()
    db.refresh(q)
    return ok(_to_dict(q))


@router.put("/{qid}")
def update_question(
    qid: int,
    body: QuizQuestionIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    q = db.query(QuizQuestion).filter(QuizQuestion.id == qid).first()
    if not q:
        raise HTTPException(status_code=404, detail="题目不存在")
    q.q = body.q
    q.options = json.dumps(body.options, ensure_ascii=False)
    q.sort = body.sort
    q.is_active = body.is_active
    db.commit()
    db.refresh(q)
    return ok(_to_dict(q))


@router.delete("/{qid}")
def delete_question(
    qid: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    q = db.query(QuizQuestion).filter(QuizQuestion.id == qid).first()
    if not q:
        raise HTTPException(status_code=404, detail="题目不存在")
    db.delete(q)
    db.commit()
    return ok()
