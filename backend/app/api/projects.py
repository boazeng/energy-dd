"""נתוני פרויקטים — נטענים מקובץ JSON שיושב על השרת (לא ב-git, מכיל שמות לקוחות).

הקובץ נוצר מתוך קובץ האקסל של החברה ומועלה ידנית ל-volume של הקונטיינר.
"""
import json
from pathlib import Path

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(prefix="/api", tags=["projects"])

_EMPTY: dict = {"buildings": [], "chargers": [], "summary": {}, "params": {}}


@router.get("/projects")
def get_projects() -> dict:
    """מחזיר את כל נתוני הפרויקטים (בניינים + מטענים + סיכום). אם אין קובץ — ריק."""
    path = Path(settings.projects_data_path)
    if not path.is_file():
        return _EMPTY
    with path.open(encoding="utf-8") as f:
        return json.load(f)
