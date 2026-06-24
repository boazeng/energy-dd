"""מודל מטלה — פריט ברשימת בדיקת הנאותות."""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

# קטגוריות הבדיקה (תואמות את ארבעת סוגי החומר)
CATEGORIES = ("tenant_agreement", "financial", "owners", "supplier_ledger")
# סטטוסים אפשריים למטלה
STATUSES = ("open", "in_progress", "done", "blocked")


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category: Mapped[str] = mapped_column(String(40), index=True)
    title: Mapped[str] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    owner: Mapped[str] = mapped_column(String(120), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
