"""מודל תזרים — פריטי הכנסה/הוצאה צפויים + הגדרת יתרת פתיחה."""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

TYPES = ("income", "expense")
RECURRENCES = ("monthly", "quarterly", "annual", "one-time")


def _now() -> datetime:
    return datetime.now(timezone.utc)


class CashflowItem(Base):
    """פריט תזרים חוזר או חד-פעמי."""

    __tablename__ = "cashflow_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    type: Mapped[str] = mapped_column(String(10), default="expense", index=True)  # income/expense
    category: Mapped[str] = mapped_column(String(60), default="")
    amount: Mapped[float] = mapped_column(Float, default=0)
    recurrence: Mapped[str] = mapped_column(String(12), default="monthly")
    day_of_month: Mapped[int] = mapped_column(Integer, default=1)
    start_month: Mapped[str] = mapped_column(String(7), default="")  # YYYY-MM
    end_month: Mapped[str] = mapped_column(String(7), default="")    # YYYY-MM (ריק = ללא סוף)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class CashflowSetting(Base):
    """הגדרת יחיד (שורה id=1) — יתרת פתיחה ותאריך."""

    __tablename__ = "cashflow_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)  # תמיד 1
    opening_balance: Mapped[float] = mapped_column(Float, default=0)
    balance_date: Mapped[str] = mapped_column(String(10), default="")  # YYYY-MM-DD
