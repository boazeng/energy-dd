"""נתיבי API להסכמי דיירים. details נשמר כ-JSON string בעמודה details_json."""
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.tenant_agreement import TenantAgreement
from app.schemas.tenant_agreement import (
    TenantAgreementCreate,
    TenantAgreementOut,
    TenantAgreementUpdate,
)
from app.seed_building_models import sync_install_income, sync_contract_dates, sync_mgmt_fee_and_elec_rate

router = APIRouter(prefix="/api/tenant-agreements", tags=["tenant-agreements"])


def _to_out(row: TenantAgreement) -> dict:
    """ממיר שורת DB לפלט — מפרק את details_json לרשימה."""
    try:
        details = json.loads(row.details_json or "[]")
    except json.JSONDecodeError:
        details = []
    return {
        "id": row.id,
        "tenant_name": row.tenant_name,
        "building": row.building,
        "address": row.address,
        "units": row.units,
        "term": row.term,
        "payment": row.payment,
        "pricing_model": row.pricing_model,
        "termination": row.termination,
        "summary": row.summary,
        "flags": row.flags,
        "charger_cost": row.charger_cost or "",
        "notes": row.notes or "",
        "review_notes": row.review_notes or "",
        "details": details,
        "source_file": row.source_file,
        "source_url": row.source_url,
        "status": row.status,
        "created_at": row.created_at,
    }


@router.get("", response_model=list[TenantAgreementOut])
def list_agreements(db: Session = Depends(get_db)):
    rows = db.scalars(select(TenantAgreement).order_by(TenantAgreement.id))
    return [_to_out(r) for r in rows]


@router.post("", response_model=TenantAgreementOut, status_code=201)
def create_agreement(payload: TenantAgreementCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    details = data.pop("details", [])
    row = TenantAgreement(**data, details_json=json.dumps(details, ensure_ascii=False))
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.patch("/{agreement_id}", response_model=TenantAgreementOut)
def update_agreement(
    agreement_id: int, payload: TenantAgreementUpdate, db: Session = Depends(get_db)
):
    row = db.get(TenantAgreement, agreement_id)
    if row is None:
        raise HTTPException(status_code=404, detail="הסכם לא נמצא")
    data = payload.model_dump(exclude_unset=True)
    if "details" in data:
        row.details_json = json.dumps(data.pop("details"), ensure_ascii=False)
    for field, value in data.items():
        setattr(row, field, value)
    db.commit()
    # סנכרן building_models אחרי כל עדכון הסכם
    sync_install_income(db)
    sync_contract_dates(db)
    sync_mgmt_fee_and_elec_rate(db)
    db.refresh(row)
    return _to_out(row)
