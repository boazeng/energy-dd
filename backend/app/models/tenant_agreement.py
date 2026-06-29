"""מודל הסכם דייר — שורת סיכום בטבלה + פרטים מורחבים (JSON)."""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class TenantAgreement(Base):
    __tablename__ = "tenant_agreements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # --- שדות הסיכום (עמודות הטבלה) ---
    tenant_name: Mapped[str] = mapped_column(String(200), default="")   # שם הדייר/חברה
    building: Mapped[str] = mapped_column(String(200), default="")       # בניין/פרויקט
    address: Mapped[str] = mapped_column(String(300), default="")        # כתובת
    units: Mapped[str] = mapped_column(String(120), default="")          # יחידות/עמדות טעינה
    term: Mapped[str] = mapped_column(String(200), default="")           # תקופת ההסכם
    payment: Mapped[str] = mapped_column(String(200), default="")        # דמי שכירות/תשלום
    pricing_model: Mapped[str] = mapped_column(String(300), default="")  # מנגנון תמחור הטענה
    termination: Mapped[str] = mapped_column(String(300), default="")    # סיום/חידוש

    # --- סיכום וניתוח ---
    summary: Mapped[str] = mapped_column(Text, default="")               # סיכום קצר
    flags: Mapped[str] = mapped_column(Text, default="")                 # דגלים/נקודות לתשומת לב

    # --- הרחבה: מערך סעיפים [{"title":..,"content":..}] כ-JSON ---
    details_json: Mapped[str] = mapped_column(Text, default="[]")

    # --- עלות רכישה/התקנה לדייר (₪0 כשע"ח היזם) ---
    charger_cost: Mapped[str] = mapped_column(Text, default="")

    # --- הערות / אי-התאמות מול נתוני החברה ---
    notes: Mapped[str] = mapped_column(Text, default="")

    # --- הערות לאחר סקירה ידנית ---
    review_notes: Mapped[str] = mapped_column(Text, default="")

    # --- מטא ---
    source_file: Mapped[str] = mapped_column(String(300), default="")    # שם קובץ המקור
    source_url: Mapped[str] = mapped_column(Text, default="")            # קישור ל-SharePoint
    status: Mapped[str] = mapped_column(String(20), default="draft")     # draft/confirmed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
