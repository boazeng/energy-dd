"""מודל טקסטים ערוכים של "תכנית עסקית לבנק".

המסמך עצמו הוא שכפול נאמן של הקובץ שאושר, ולכן נוסח ברירת המחדל של כל בלוק
חי בקוד ולא ב-DB. כאן נשמרים רק הבלוקים שנערכו באתר בפועל: מפתח הבלוק מול
הנוסח החדש. בלוק שלא נערך — או שנמחקה עריכתו — פשוט אינו קיים כאן, וחוזר
לנוסח שבקובץ.
"""
from datetime import datetime, timezone

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class BankPlanText(Base):
    __tablename__ = "bank_plan_texts"

    # מפתח הבלוק במסמך, למשל "2.1" או "4.3" — נקבע ב-BankPlan.jsx
    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    body: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)
