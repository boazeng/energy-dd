"""ניתוח כספי — נטען מקובץ JSON שיושב על השרת (לא ב-git, מידע פיננסי רגיש).

נוצר מתוך הדוחות הכספיים המבוקרים (2023–2024) ומאזני הבוחן (2025, 2026).
"""
import json
from pathlib import Path

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(prefix="/api", tags=["financials"])

_EMPTY: dict = {"years": [], "pnl": [], "balance": [], "flags": []}


@router.get("/financials")
def get_financials() -> dict:
    """מחזיר את הניתוח הכספי לפי שנים. אם אין קובץ — ריק."""
    path = Path(settings.financials_data_path)
    if not path.is_file():
        return _EMPTY
    with path.open(encoding="utf-8") as f:
        return json.load(f)
