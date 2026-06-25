"""נתיבי API לשאלות לבירור."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.question import Question
from app.schemas.question import QuestionCreate, QuestionOut, QuestionUpdate

router = APIRouter(prefix="/api/questions", tags=["questions"])


@router.get("", response_model=list[QuestionOut])
def list_questions(db: Session = Depends(get_db)):
    return list(db.scalars(select(Question).order_by(Question.id.desc())))


@router.post("", response_model=QuestionOut, status_code=201)
def create_question(payload: QuestionCreate, db: Session = Depends(get_db)):
    q = Question(**payload.model_dump())
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


@router.patch("/{q_id}", response_model=QuestionOut)
def update_question(q_id: int, payload: QuestionUpdate, db: Session = Depends(get_db)):
    q = db.get(Question, q_id)
    if q is None:
        raise HTTPException(status_code=404, detail="שאלה לא נמצאה")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(q, field, value)
    db.commit()
    db.refresh(q)
    return q


@router.delete("/{q_id}", status_code=204)
def delete_question(q_id: int, db: Session = Depends(get_db)):
    q = db.get(Question, q_id)
    if q:
        db.delete(q)
        db.commit()
