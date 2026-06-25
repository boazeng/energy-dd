"""מודל תזרים פר-בניין — הגדרות גידול ועלויות מטענים."""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class BuildingModel(Base):
    """הגדרות פיננסיות לבניין בודד לצורך תחזית תזרים."""

    __tablename__ = "building_models"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    building_name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)

    # מצב נוכחי
    current_chargers: Mapped[int] = mapped_column(Integer, default=0)
    potential_spots: Mapped[int] = mapped_column(Integer, default=0)

    # גידול
    annual_growth_rate: Mapped[float] = mapped_column(Float, default=0)  # % מהחניות הפוטנציאליות

    # הכנסה למטען (חודשית)
    mgmt_fee_per_charger: Mapped[float] = mapped_column(Float, default=0)         # עמלת ניהול ₪
    electricity_rate_agorot: Mapped[float] = mapped_column(Float, default=0)      # עמלת חשמל אג'/kWh
    avg_kwh_per_charger_monthly: Mapped[float] = mapped_column(Float, default=0)  # צריכה ממוצעת kWh/חודש
    subscription_fee_per_charger: Mapped[float] = mapped_column(Float, default=0) # דמי מנוי ₪

    # עלות מטען חדש (חד-פעמי)
    charger_purchase_cost: Mapped[float] = mapped_column(Float, default=0)  # עלות רכישה ₪
    charger_install_cost: Mapped[float] = mapped_column(Float, default=0)   # עלות התקנה ₪

    # הוצאות תפעוליות שנתיות (OPEX)
    chargers_no_rcd: Mapped[int] = mapped_column(Integer, default=0)           # מטענים ללא פחת (מסונכרן מהאקסל)
    cost_rcd_per_charger: Mapped[float] = mapped_column(Float, default=300)    # עלות שנתית למטען ללא פחת ₪
    cost_internet_per_charger: Mapped[float] = mapped_column(Float, default=400)   # אינטרנט ₪/שנה למטען
    cost_inspector_per_charger: Mapped[float] = mapped_column(Float, default=250)  # אישור בודק ₪/שנה למטען

    # פרמטרי תחזית
    start_year: Mapped[int] = mapped_column(Integer, default=2025)
    forecast_years: Mapped[int] = mapped_column(Integer, default=5)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)
