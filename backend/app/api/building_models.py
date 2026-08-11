"""נתיבי API לתזרים פר-בניין — CRUD + חישוב תחזית שנתית."""
import math

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.models.building_model import BuildingModel
from app.models.business_plan import BusinessPlanSetting
from app.models.cashflow import CashflowLoan
from app.schemas.building_model import (
    BuildingForecastOut,
    BuildingModelCreate,
    BuildingModelOut,
    BuildingModelUpdate,
    CombinedForecastYear,
    YearForecast,
)
from app.seed_building_models import (
    sync_contract_dates,
    sync_install_income,
    sync_mgmt_fee_and_elec_rate,
    sync_projects_data,
)

router = APIRouter(prefix="/api/building-models", tags=["building-models"])


def _first_year_growth(db: Session) -> float:
    """שיעור הגידול בשנת הפתיחה, מהגדרות התכנית. מקור אמת אחד לכל הלשוניות."""
    s = db.get(BusinessPlanSetting, 1)
    return float(getattr(s, "first_year_growth_rate", 0) or 0) if s else 0.0


def _effective_forecast_years(bm: BuildingModel) -> int:
    """מחשב מספר שנות תחזית: לפי הסכם אם מוגדר, אחרת forecast_years."""
    if bm.contract_start_year and bm.contract_duration_years:
        contract_end = bm.contract_start_year + bm.contract_duration_years
        return max(1, contract_end - bm.start_year)
    return bm.forecast_years


def _calc_forecast(
    bm: BuildingModel,
    override_years: int | None = None,
    growth_override: float | None = None,
    first_year_growth: float | None = None,
) -> list[YearForecast]:
    """מחשב תחזית שנתית לבניין — גידול מטענים, הכנסות, CAPEX ו-OPEX.

    growth_override: שיעור גידול שנתי חלופי (%) במקום זה שב-DB — לניתוח רגישות.
    first_year_growth: שיעור הגידול בשנת הפתיחה (%). None או 0 = אין גידול בה,
        כלומר השנה מציגה את המצב הקיים בלבד.
    """
    monthly_income_per_charger = (
        bm.mgmt_fee_per_charger
        + (bm.electricity_rate_agorot / 100) * bm.avg_kwh_per_charger_monthly
        + bm.subscription_fee_per_charger
    )

    # CAPEX: עלות ישירה למטען + חלק מארונות (חשמל+תקשורת) לכל k מטענים
    direct_per_charger = (
        bm.cost_charger_unit + bm.cost_infra_per_charger + bm.cost_install_per_charger
    )
    panel_cost_total = bm.cost_elec_panel + bm.cost_comm_panel
    chargers_per_panel = max(1, bm.chargers_per_panel)

    # עלויות נוספות פר מטען
    extra_costs = bm.extra_costs or []
    if isinstance(extra_costs, str):
        import json as _json
        extra_costs = _json.loads(extra_costs)
    extra_per_charger = sum(float(c.get("cost_per_charger", 0)) for c in extra_costs)

    # OPEX חד-פעמי בשנה הראשונה בלבד — עלות קיום למטענים שקיימים היום
    # chargers_no_rcd לא יכול לעלות על current_chargers (בניין ללא מטענים = אין עלות)
    effective_no_rcd = min(bm.chargers_no_rcd, bm.current_chargers)
    opex_year_one = (
        bm.current_chargers * (bm.cost_internet_per_charger + bm.cost_inspector_per_charger + extra_per_charger)
        + effective_no_rcd * bm.cost_rcd_per_charger
    )

    growth_rate = bm.annual_growth_rate if growth_override is None else growth_override
    new_per_year = math.floor(bm.potential_spots * growth_rate / 100) if bm.potential_spots > 0 else 0

    # שנת הפתיחה נושאת שיעור גידול משלה, נמוך מהשוטף. בניתוח הרגישות היא
    # מוסטת באותו יחס כמו השוטף, אחרת התרחישים היו נבדלים רק בשנים שאחריה.
    first_rate = first_year_growth or 0.0
    if first_rate and growth_override is not None and bm.annual_growth_rate:
        first_rate *= growth_override / bm.annual_growth_rate
    new_first_year = math.floor(bm.potential_spots * first_rate / 100) if bm.potential_spots > 0 else 0

    total = bm.current_chargers
    years: list[YearForecast] = []

    for i in range(override_years if override_years else _effective_forecast_years(bm)):
        # שנה ראשונה = מצב קיים בתוספת גידול ההטמעה, ו-OPEX חד-פעמי;
        # שנים הבאות = גידול שוטף, OPEX=0
        cap = new_first_year if i == 0 else new_per_year
        annual_opex = opex_year_one if i == 0 else 0
        remaining = max(0, bm.potential_spots - total)
        added = min(cap, remaining)
        total += added

        panels_needed = math.ceil(added / chargers_per_panel) if added > 0 else 0
        capex = added * direct_per_charger + panels_needed * panel_cost_total

        install_income = added * bm.charger_install_income
        annual_income = total * monthly_income_per_charger * 12 + install_income
        maintenance_opex = total * bm.cost_maintenance_per_charger
        profit = annual_income - capex - annual_opex - maintenance_opex
        years.append(YearForecast(
            year=bm.start_year + i,
            chargers_added=added,
            total_chargers=total,
            annual_income=round(annual_income, 2),
            capex=round(capex, 2),
            annual_opex=round(annual_opex, 2),
            maintenance_opex=round(maintenance_opex, 2),
            profit=round(profit, 2),
        ))

    return years


# ─── סנכרון מפרויקטים ────────────────────────────────────────────────────────

@router.post("/sync-projects", status_code=200)
def sync_from_projects(db: Session = Depends(get_db)):
    """מעדכן current_chargers ו-potential_spots מ-projects.json."""
    updated = sync_projects_data(db, settings.projects_data_path)
    return {"updated": updated}


# ─── CRUD ────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[BuildingModelOut])
def list_buildings(db: Session = Depends(get_db)):
    return list(db.scalars(select(BuildingModel).order_by(BuildingModel.building_name)))


@router.post("", response_model=BuildingModelOut, status_code=201)
def create_building(payload: BuildingModelCreate, db: Session = Depends(get_db)):
    bm = BuildingModel(**payload.model_dump())
    db.add(bm)
    db.commit()
    db.refresh(bm)
    return bm


@router.patch("/{bm_id}", response_model=BuildingModelOut)
def update_building(bm_id: int, payload: BuildingModelUpdate, db: Session = Depends(get_db)):
    bm = db.get(BuildingModel, bm_id)
    if bm is None:
        raise HTTPException(status_code=404, detail="בניין לא נמצא")
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(bm, field, value)
    db.commit()
    if "agreement_id" in data:
        # קישור/ניתוק הסכם — סנכרן מיד את השדות הנגזרים מההסכם המקושר
        sync_install_income(db)
        sync_contract_dates(db)
        sync_mgmt_fee_and_elec_rate(db)
    db.refresh(bm)
    return bm


@router.delete("/{bm_id}", status_code=204)
def delete_building(bm_id: int, db: Session = Depends(get_db)):
    bm = db.get(BuildingModel, bm_id)
    if bm is None:
        raise HTTPException(status_code=404, detail="בניין לא נמצא")
    db.delete(bm)
    db.commit()


# ─── עזר: שפיצר וגרייס ──────────────────────────────────────────────────────

def _loan_schedule(loan: CashflowLoan) -> list[dict[str, float]]:
    """לוח סילוקין חודשי, כולל תקופת גרייס מלא בתחילת ההלוואה.

    בגרייס אין תשלום כלל: הריבית נצברת ומצטרפת לקרן (היוון), ולוח השפיצר מתחיל
    אחריו על היתרה המוגדלת ונפרס על מלוא `years`. כלומר הגרייס מאריך את
    ההלוואה בפועל ואינו נבלע בתוך תקופת ההחזר — סה"כ `grace_months + years*12`
    חודשים.

    בשורות הגרייס `principal` הוא 0 (לא נפרעה קרן) והריבית עדיין נרשמת כהוצאת
    מימון לרווח והפסד. הריבית שהוונה נפרעת בהמשך כחלק מהקרן, ולכן סך הקרן
    לאורך ההלוואה גדול מסכום ההלוואה המקורי — וסך התשלומים נשאר קרן + ריבית.
    """
    r = (loan.prime + loan.margin) / 100 / 12    # ריבית חודשית
    g = max(0, getattr(loan, "grace_months", 0) or 0)
    n = max(1, loan.years * 12)                  # מספר תשלומים חודשיים
    rows: list[dict[str, float]] = []
    balance = float(loan.amount or 0)

    for _ in range(g):
        interest = balance * r
        balance += interest
        rows.append({"payment": 0.0, "interest": interest, "principal": 0.0,
                     "balance": balance, "grace": 1.0})

    pmt = balance / n if r == 0 else balance * r / (1 - (1 + r) ** (-n))
    for i in range(n):
        interest = balance * r
        principal = balance if i == n - 1 else pmt - interest
        balance = max(0.0, balance - principal)
        rows.append({"payment": principal + interest, "interest": interest,
                     "principal": principal, "balance": balance, "grace": 0.0})
    return rows


def _loan_by_year(loan: CashflowLoan, start_year: int) -> dict[int, dict[str, float]]:
    """מסכם את לוח הסילוקין לשנים קלנדריות. מפתח = שנה.

    כמו בשאר האתר, חודש הפתיחה בתוך השנה אינו נלקח בחשבון — השנה הראשונה היא
    12 החודשים הראשונים של הלוח.
    """
    out: dict[int, dict[str, float]] = {}
    for i, row in enumerate(_loan_schedule(loan)):
        y = out.setdefault(start_year + i // 12,
                           {"payment": 0.0, "interest": 0.0, "principal": 0.0,
                            "grace_interest": 0.0, "grace_months": 0.0})
        y["payment"] += row["payment"]
        y["interest"] += row["interest"]
        y["principal"] += row["principal"]
        if row["grace"]:
            y["grace_interest"] += row["interest"]
            y["grace_months"] += 1
    return out


def _shpitzer_annual(loan: CashflowLoan) -> float:
    """תשלום שנתי קבוע בתקופת ההחזר — כלומר אחרי הגרייס."""
    return sum(x["payment"] for x in _loan_schedule(loan) if not x["grace"]) / max(1, loan.years)


# ─── תחזית ───────────────────────────────────────────────────────────────────

@router.get("/forecast/combined", response_model=list[CombinedForecastYear])
def combined_forecast(
    force_years: int | None = Query(None, ge=1, le=50, description="אחיד לכל הבניינים"),
    db: Session = Depends(get_db),
):
    """תחזית מאוחדת לכל הבניינים — לפי שנה, כולל החזר הלוואה.
    force_years: אם מסופק, מחליף את תקופת ההסכם של כל בניין בערך אחיד.
    """
    buildings = list(db.scalars(select(BuildingModel)))
    if not buildings:
        return []

    # פרמטרי הלוואה
    loan = db.get(CashflowLoan, 1)
    if loan is None:
        loan = CashflowLoan(id=1)
    loan_start_year = int(loan.start_month[:4]) if loan.start_month else min(b.start_year for b in buildings)
    first_year_growth = _first_year_growth(db)

    # מציאת טווח שנים מקסימלי — לפי תקופת ההסכם בכל בניין, או force_years
    effective = lambda b: force_years if force_years else _effective_forecast_years(b)
    min_year = min(b.start_year for b in buildings)
    max_year = max(b.start_year + effective(b) - 1 for b in buildings)

    # הגרייס מאריך את ההלוואה מעבר לשנות ההחזר, ולכן זנב הלוח עלול לחרוג משנת
    # התחזית האחרונה. הוא מקופל לתוכה כדי שסך ההחזר המוצג יישאר מלא ולא ייעלמו
    # ממנו חודשים.
    loan_years = _loan_by_year(loan, loan_start_year)
    for y in sorted(k for k in loan_years if k > max_year):
        tail = loan_years.pop(y)
        last = loan_years.setdefault(max_year, {"payment": 0.0, "interest": 0.0,
                                                "principal": 0.0, "grace_interest": 0.0,
                                                "grace_months": 0.0})
        for k, v in tail.items():
            last[k] += v

    # מיפוי תחזית לכל בניין
    forecasts: dict[str, dict[int, YearForecast]] = {}
    for bm in buildings:
        years = _calc_forecast(bm, override_years=force_years, first_year_growth=first_year_growth)
        forecasts[bm.building_name] = {yf.year: yf for yf in years}

    result: list[CombinedForecastYear] = []
    for year in range(min_year, max_year + 1):
        total_income = 0.0
        total_capex = 0.0
        total_opex = 0.0
        total_maint = 0.0
        total_profit = 0.0
        bldg_map: dict[str, YearForecast] = {}
        for bm in buildings:
            yf = forecasts[bm.building_name].get(year)
            if yf:
                bldg_map[bm.building_name] = yf
                total_income += yf.annual_income
                total_capex += yf.capex
                total_opex += yf.annual_opex
                total_maint += yf.maintenance_opex
                total_profit += yf.profit

        loan_repay = round(loan_years.get(year, {}).get("payment", 0.0), 2)
        result.append(CombinedForecastYear(
            year=year,
            buildings=bldg_map,
            total_income=round(total_income, 2),
            total_capex=round(total_capex, 2),
            total_opex=round(total_opex, 2),
            total_maint=round(total_maint, 2),
            loan_repayment=loan_repay,
            total_profit=round(total_profit - loan_repay, 2),
        ))

    return result


@router.get("/{bm_id}/forecast", response_model=BuildingForecastOut)
def building_forecast(
    bm_id: int,
    force_years: int | None = Query(None, ge=1, le=50),
    db: Session = Depends(get_db),
):
    bm = db.get(BuildingModel, bm_id)
    if bm is None:
        raise HTTPException(status_code=404, detail="בניין לא נמצא")
    years = _calc_forecast(bm, override_years=force_years, first_year_growth=_first_year_growth(db))
    return BuildingForecastOut(
        building=BuildingModelOut.model_validate(bm),
        years=years,
        total_income=round(sum(y.annual_income for y in years), 2),
        total_capex=round(sum(y.capex for y in years), 2),
        total_opex=round(sum(y.annual_opex for y in years), 2),
        total_profit=round(sum(y.profit for y in years), 2),
    )
