"""מודל התכנית העסקית — פרקים נרטיביים ניתנים לעריכה + פרטי המסמך.

המספרים במסמך אינם נשמרים כאן: הם נשלפים חיים מ-building_models / cashflow /
financials בכל טעינה (ראה api/business_plan.py). כאן נשמר רק מה שאדם כותב.
"""
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class BusinessPlanSection(Base):
    """פרק או תת-פרק במסמך. `data_block` קובע איזו טבלה/תרשים חי מוזרק אחרי הטקסט."""

    __tablename__ = "business_plan_sections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    order: Mapped[int] = mapped_column(Integer, default=0, index=True)
    level: Mapped[int] = mapped_column(Integer, default=1)   # 1 = פרק, 2 = תת-פרק
    title: Mapped[str] = mapped_column(String(200), default="")
    body: Mapped[str] = mapped_column(Text, default="")      # טקסט; שורה שמתחילה ב-"- " = תבליט
    data_block: Mapped[str] = mapped_column(String(40), default="")  # ריק = טקסט בלבד
    visible: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class BusinessPlanSetting(Base):
    """פרטי המסמך (שורה יחידה id=1) — מי מגיש, למי, ובאיזה אופק."""

    __tablename__ = "business_plan_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)  # תמיד 1
    company_name: Mapped[str] = mapped_column(String(200), default="אנרגיה ירוקה")
    doc_title: Mapped[str] = mapped_column(String(200), default="תכנית עסקית")
    submitted_to: Mapped[str] = mapped_column(String(200), default="בנק הפועלים")
    prepared_by: Mapped[str] = mapped_column(String(200), default="")
    doc_date: Mapped[str] = mapped_column(String(10), default="")   # YYYY-MM-DD; ריק = היום
    horizon_years: Mapped[int] = mapped_column(Integer, default=5)

    # עסקת הרכישה — התכנית תומכת בבקשת אשראי לרכישת הפעילות.
    # האשראי המבוקש עצמו נלקח מ-cashflow_loan.amount (לשונית תזרים), כדי שלא
    # יהיו שני מקורות אמת לאותו מספר. ההפרש ביניהם = ההון העצמי הנדרש.
    acquisition_cost: Mapped[float] = mapped_column(Float, default=0)
    target_company: Mapped[str] = mapped_column(String(200), default="")
    contact_name: Mapped[str] = mapped_column(String(120), default="")
    contact_phone: Mapped[str] = mapped_column(String(60), default="")
    contact_email: Mapped[str] = mapped_column(String(120), default="")
