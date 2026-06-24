"""נתיבי API לתזרים — פריטים (CRUD) + הגדרת יתרת פתיחה."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.cashflow import CashflowItem, CashflowSetting
from app.schemas.cashflow import (
    CashflowItemCreate,
    CashflowItemOut,
    CashflowItemUpdate,
    CashflowOut,
    CashflowSettingsIn,
    CashflowSettingsOut,
)

router = APIRouter(prefix="/api/cashflow", tags=["cashflow"])


def _get_settings(db: Session) -> CashflowSetting:
    """מחזיר את שורת ההגדרות (id=1), יוצר אם חסרה."""
    s = db.get(CashflowSetting, 1)
    if s is None:
        s = CashflowSetting(id=1, opening_balance=0, balance_date="")
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


@router.get("", response_model=CashflowOut)
def get_cashflow(db: Session = Depends(get_db)):
    items = list(db.scalars(select(CashflowItem).order_by(CashflowItem.id)))
    return {"items": items, "settings": _get_settings(db)}


@router.post("", response_model=CashflowItemOut, status_code=201)
def create_item(payload: CashflowItemCreate, db: Session = Depends(get_db)):
    item = CashflowItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{item_id}", response_model=CashflowItemOut)
def update_item(item_id: int, payload: CashflowItemUpdate, db: Session = Depends(get_db)):
    item = db.get(CashflowItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="פריט תזרים לא נמצא")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(CashflowItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="פריט תזרים לא נמצא")
    db.delete(item)
    db.commit()


@router.put("/settings", response_model=CashflowSettingsOut)
def update_settings(payload: CashflowSettingsIn, db: Session = Depends(get_db)):
    s = _get_settings(db)
    s.opening_balance = payload.opening_balance
    s.balance_date = payload.balance_date
    db.commit()
    db.refresh(s)
    return s
