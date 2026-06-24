"""זריעת תזרים ראשונית — רק אם הטבלה ריקה, מתוך קובץ JSON על ה-volume (לא ב-git)."""
import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.cashflow import CashflowItem, CashflowSetting


def seed_cashflow(db: Session) -> int:
    """מוסיף פריטי תזרים והגדרות מתוך קובץ הזריעה, רק אם אין עדיין פריטים."""
    if db.scalar(select(CashflowItem.id).limit(1)) is not None:
        return 0
    path = Path(settings.cashflow_seed_path)
    if not path.is_file():
        return 0
    data = json.loads(path.read_text(encoding="utf-8"))

    items = data.get("items", [])
    for it in items:
        db.add(CashflowItem(
            name=it.get("name", ""),
            type=it.get("type", "expense"),
            category=it.get("category", ""),
            amount=float(it.get("amount", 0) or 0),
            recurrence=it.get("recurrence", "monthly"),
            day_of_month=int(it.get("day_of_month", 1) or 1),
            start_month=it.get("start_month", ""),
            end_month=it.get("end_month", ""),
            note=it.get("note", ""),
        ))

    st = data.get("settings", {})
    s = db.get(CashflowSetting, 1)
    if s is None:
        s = CashflowSetting(id=1)
        db.add(s)
    s.opening_balance = float(st.get("opening_balance", 0) or 0)
    s.balance_date = st.get("balance_date", "")

    db.commit()
    return len(items)
