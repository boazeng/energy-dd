"""מודל תזרים פר-בניין — הגדרות גידול ועלויות מטענים."""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, JSON, String
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
    mgmt_fee_per_charger: Mapped[float] = mapped_column(Float, default=0)
    electricity_rate_agorot: Mapped[float] = mapped_column(Float, default=0)      # אג'/kWh
    avg_kwh_per_charger_monthly: Mapped[float] = mapped_column(Float, default=0)  # kWh/חודש
    subscription_fee_per_charger: Mapped[float] = mapped_column(Float, default=0)

    # CAPEX — עלויות מטען חדש (ניתנות לשינוי)
    cost_charger_unit: Mapped[float] = mapped_column(Float, default=800)          # עלות מטען ₪
    cost_infra_per_charger: Mapped[float] = mapped_column(Float, default=1200)    # תשתית חשמל+תקשורת ₪
    cost_install_per_charger: Mapped[float] = mapped_column(Float, default=1300)  # התקנה+בודק ₪
    cost_elec_panel: Mapped[float] = mapped_column(Float, default=6000)           # ארון חשמל ₪
    cost_comm_panel: Mapped[float] = mapped_column(Float, default=1000)           # ארון תקשורת ₪
    chargers_per_panel: Mapped[int] = mapped_column(Integer, default=10)          # מטענים לארון

    # OPEX — הוצאות תפעוליות שנתיות (רק על מטענים קיימים)
    chargers_no_rcd: Mapped[int] = mapped_column(Integer, default=0)              # מסונכרן מהאקסל
    cost_rcd_per_charger: Mapped[float] = mapped_column(Float, default=300)       # פחת חסר ₪/שנה
    cost_internet_per_charger: Mapped[float] = mapped_column(Float, default=400)  # אינטרנט ₪/שנה
    cost_inspector_per_charger: Mapped[float] = mapped_column(Float, default=250) # בודק ₪/שנה

    # הכנסה מהתקנת מטען חדש (לפי הסכם דייר) — מסונכרן מ-tenant_agreements.charger_cost
    charger_install_income: Mapped[float] = mapped_column(Float, default=0)

    # עלויות נוספות — רשימה גמישה: [{"name": "...", "cost_per_charger": 100}, ...]
    extra_costs: Mapped[list] = mapped_column(JSON, default=list, nullable=True)

    # פרמטרי תחזית
    start_year: Mapped[int] = mapped_column(Integer, default=2025)
    forecast_years: Mapped[int] = mapped_column(Integer, default=5)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)
