"""נתיבי API — כרטסת ספקים 2026."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.supplier_ledger import SupplierLedgerRow
from app.schemas.supplier_ledger import (
    SupplierLedgerCreate,
    SupplierLedgerOut,
    SupplierLedgerUpdate,
)

router = APIRouter(prefix="/api/supplier-ledger", tags=["supplier-ledger"])


@router.get("", response_model=list[SupplierLedgerOut])
def list_rows(db: Session = Depends(get_db)):
    return list(db.scalars(select(SupplierLedgerRow).order_by(SupplierLedgerRow.supplier_name)))


@router.post("", response_model=SupplierLedgerOut, status_code=201)
def create_row(payload: SupplierLedgerCreate, db: Session = Depends(get_db)):
    row = SupplierLedgerRow(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/{row_id}", response_model=SupplierLedgerOut)
def update_row(row_id: int, payload: SupplierLedgerUpdate, db: Session = Depends(get_db)):
    row = db.get(SupplierLedgerRow, row_id)
    if row is None:
        raise HTTPException(status_code=404, detail="שורה לא נמצאה")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{row_id}", status_code=204)
def delete_row(row_id: int, db: Session = Depends(get_db)):
    row = db.get(SupplierLedgerRow, row_id)
    if row is None:
        raise HTTPException(status_code=404, detail="שורה לא נמצאה")
    db.delete(row)
    db.commit()
