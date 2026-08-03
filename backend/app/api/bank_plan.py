"""נתיבי API לטקסטים הערוכים של "תכנית עסקית לבנק".

נשמרים כאן רק בלוקים שנערכו בפועל; כל השאר חוזר לנוסח שבקוד. שמירת טקסט ריק
מוחקת את העריכה ומחזירה את הבלוק לנוסח המקורי שבקובץ שאושר.

המספרים במסמך אינם עוברים כאן — הם נשלפים חיים מ-/api/business-plan/data.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.bank_plan import BankPlanText

router = APIRouter(prefix="/api/bank-plan", tags=["bank-plan"])


class TextIn(BaseModel):
    body: str


@router.get("/texts")
def get_texts(db: Session = Depends(get_db)) -> dict[str, str]:
    """כל הבלוקים שנערכו: מפתח → נוסח."""
    return {t.key: t.body for t in db.scalars(select(BankPlanText))}


@router.put("/texts/{key}")
def put_text(key: str, payload: TextIn, db: Session = Depends(get_db)) -> dict[str, str]:
    """שומר נוסח לבלוק. גוף ריק מוחק את העריכה ומחזיר לנוסח שבקוד."""
    row = db.get(BankPlanText, key)
    body = payload.body.strip()

    if not body:
        if row is not None:
            db.delete(row)
            db.commit()
        return {"key": key, "body": ""}

    if row is None:
        db.add(BankPlanText(key=key, body=body))
    else:
        row.body = body
    db.commit()
    return {"key": key, "body": body}
