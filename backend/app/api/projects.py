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


def _normalize_keep_digits(s: str) -> str:
    s = re.sub(r'[+\-/,"׳\'״]', " ", s or "")
    return re.sub(r"\s+", " ", s).strip()


# ארבעת בניני HI GROUP (אשקלון) חתומים תחת הסכם מרוכז אחד; המטענים המותקנים
# בפועל מאומתים רק בגבע 2 (26) — projects.json של החברה מייחס בטעות 13/1
# למספרי הבית בן גוריון 7/9. אותה עובדה כבר מתוקנת ב-building_models דרך
# apply_manual_building_corrections (backend/app/migrations.py); התיקון כאן
# נועד לשמור על אותו סה"כ בדף סטטוס פרויקטים כמו בדף תזרים.
_HI_GROUP_CITY = _normalize_keep_digits("אשקלון")
_HI_GROUP_CHARGERS = {
    _normalize_keep_digits("בן גוריון 7"): 0,
    _normalize_keep_digits("בן גוריון 9"): 0,
    _normalize_keep_digits("אשתאול 1"): 0,
    _normalize_keep_digits("גבע 2"): 26,
}


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

        street_norm = _normalize_keep_digits(b.get("project", ""))
        city_norm = _normalize_keep_digits(b.get("city", ""))
        if city_norm == _HI_GROUP_CITY and street_norm in _HI_GROUP_CHARGERS:
            b["chargers_installed"] = _HI_GROUP_CHARGERS[street_norm]

    return data
