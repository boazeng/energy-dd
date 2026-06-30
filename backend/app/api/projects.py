"""נתוני פרויקטים — נטענים מקובץ JSON שיושב על השרת (לא ב-git, מכיל שמות לקוחות).

הקובץ נוצר מתוך קובץ האקסל של החברה ומועלה ידנית ל-volume של הקונטיינר.
"""
import json
import re
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.models.tenant_agreement import TenantAgreement

router = APIRouter(prefix="/api", tags=["projects"])

_EMPTY: dict = {"buildings": [], "chargers": [], "summary": {}, "params": {}}


def _normalize(s: str) -> str:
    s = re.sub(r"[0-9]", "", s or "")
    s = re.sub(r'[+\-/,"׳\'״]', " ", s)
    return re.sub(r"\s+", " ", s).strip()


@router.get("/projects")
def get_projects(db: Session = Depends(get_db)) -> dict:
    """מחזיר את כל נתוני הפרויקטים (בניינים + מטענים + סיכום). אם אין קובץ — ריק."""
    path = Path(settings.projects_data_path)
    if not path.is_file():
        return _EMPTY
    with path.open(encoding="utf-8") as f:
        data = json.load(f)

    # בדיקה לאילו בניינים קיים הסכם ב-DB
    agreements = list(db.scalars(select(TenantAgreement)))
    agr_norms = {_normalize(a.building.split(",")[0].strip()) for a in agreements if a.building}

    for b in data.get("buildings", []):
        proj_norm = _normalize(b.get("project", ""))
        b["has_agreement"] = any(
            n and (n in proj_norm or proj_norm in n)
            for n in agr_norms
        )

    return data
