"""מודל כרטסת ספקים — תנועות חובה/זכות 2026."""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class SupplierLedgerRow(Base):
    __tablename__ = "supplier_ledger"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    supplier_name: Mapped[str] = mapped_column(String(200))
    account_number: Mapped[str] = mapped_column(String(20), default="")
    opening_balance: Mapped[float] = mapped_column(Float, default=0.0)  # יתרת פתיחה
    debit: Mapped[float] = mapped_column(Float, default=0.0)             # חובה
    credit: Mapped[float] = mapped_column(Float, default=0.0)            # זכות
    balance: Mapped[float] = mapped_column(Float, default=0.0)           # יתרת סגירה
    completion: Mapped[str] = mapped_column(Text, default="")            # השלמות מול החברה
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
