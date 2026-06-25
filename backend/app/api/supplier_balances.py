"""נתיבי API — ספקים ביתרת זכות (חובות החברה לספקים) 2026."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.supplier_balance import SupplierBalance
from app.schemas.supplier_balance import (
    SupplierBalanceCreate,
    SupplierBalanceOut,
    SupplierBalanceUpdate,
)

router = APIRouter(prefix="/api/supplier-balances", tags=["supplier-balances"])


@router.get("", response_model=list[SupplierBalanceOut])
def list_balances(db: Session = Depends(get_db)):
    return list(db.scalars(select(SupplierBalance).order_by(SupplierBalance.supplier_name)))


@router.post("", response_model=SupplierBalanceOut, status_code=201)
def create_balance(payload: SupplierBalanceCreate, db: Session = Depends(get_db)):
    row = SupplierBalance(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/{row_id}", response_model=SupplierBalanceOut)
def update_balance(row_id: int, payload: SupplierBalanceUpdate, db: Session = Depends(get_db)):
    row = db.get(SupplierBalance, row_id)
    if row is None:
        raise HTTPException(status_code=404, detail="ספק לא נמצא")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{row_id}", status_code=204)
def delete_balance(row_id: int, db: Session = Depends(get_db)):
    row = db.get(SupplierBalance, row_id)
    if row is None:
        raise HTTPException(status_code=404, detail="ספק לא נמצא")
    db.delete(row)
    db.commit()
