"""מודל יתרות ספקים — ספקים ביתרת זכות (חובות החברה לספקים)."""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class SupplierBalance(Base):
    __tablename__ = "supplier_balances"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    supplier_name: Mapped[str] = mapped_column(String(200))
    balance: Mapped[float] = mapped_column(Float)          # יתרת זכות — חוב של החברה לספק
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
