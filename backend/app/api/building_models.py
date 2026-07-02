"""נתיבי API לתזרים פר-בניין — CRUD + חישוב תחזית שנתית."""
import math

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.models.building_model import BuildingModel
from app.models.cashflow import CashflowLoan
from app.schemas.building_model import (
    BuildingForecastOut,
    BuildingModelCreate,
    BuildingModelOut,
    BuildingModelUpdate,
    CombinedForecastYear,
    YearForecast,
)
from app.seed_building_models import sync_projects_data

router = APIRouter(prefix="/api/building-models", tags=["building-models"])


def _effective_forecast_years(bm: BuildingModel) -> int:
    """מחשב מספר שנות תחזית: לפי הסכם אם מוגדר, אחרת forecast_years."""
    if bm.contract_start_year and bm.contract_duration_years:
        contract_end = bm.contract_start_year + bm.contract_duration_years
        return max(1, contract_end - bm.start_year)
    return bm.forecast_years


def _calc_forecast(bm: BuildingModel, override_years: int | None = None) -> list[YearForecast]:
    """מחשב תחזית שנתית לבניין — גידול מטענים, הכנסות, CAPEX ו-OPEX."""
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
    opex_year_one = (
        bm.current_chargers * (bm.cost_internet_per_charger + bm.cost_inspector_per_charger + extra_per_charger)
        + bm.chargers_no_rcd * bm.cost_rcd_per_charger
    )

    new_per_year = math.floor(bm.potential_spots * bm.annual_growth_rate / 100) if bm.potential_spots > 0 else 0

    total = bm.current_chargers
    years: list[YearForecast] = []

    for i in range(override_years if override_years else _effective_forecast_years(bm)):
        # שנה ראשונה = מצב קיים, OPEX חד-פעמי; שנים הבאות = גידול, OPEX=0
        if i == 0:
            added = 0
            annual_opex = opex_year_one
        else:
            remaining = max(0, bm.potential_spots - total)
            added = min(new_per_year, remaining)
            annual_opex = 0
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
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(bm, field, value)
    db.commit()
    db.refresh(bm)
    return bm


@router.delete("/{bm_id}", status_code=204)
def delete_building(bm_id: int, db: Session = Depends(get_db)):
    bm = db.get(BuildingModel, bm_id)
    if bm is None:
        raise HTTPException(status_code=404, detail="בניין לא נמצא")
    db.delete(bm)
    db.commit()


# ─── עזר: שפיצר ─────────────────────────────────────────────────────────────

def _shpitzer_annual(loan: CashflowLoan) -> float:
    """תשלום שנתי קבוע לפי לוח שפיצר."""
    r = (loan.prime + loan.margin) / 100 / 12  # ריבית חודשית
    n = loan.years * 12                          # מספר תשלומים חודשיים
    if r == 0 or n == 0:
        return loan.amount / max(1, loan.years)
    pmt = loan.amount * r / (1 - (1 + r) ** (-n))
    return pmt * 12


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
    annual_loan = _shpitzer_annual(loan)
    loan_start_year = int(loan.start_month[:4]) if loan.start_month else min(b.start_year for b in buildings)
    loan_end_year = loan_start_year + loan.years - 1

    # מציאת טווח שנים מקסימלי — לפי תקופת ההסכם בכל בניין, או force_years
    effective = lambda b: force_years if force_years else _effective_forecast_years(b)
    min_year = min(b.start_year for b in buildings)
    max_year = max(b.start_year + effective(b) - 1 for b in buildings)

    # מיפוי תחזית לכל בניין
    forecasts: dict[str, dict[int, YearForecast]] = {}
    for bm in buildings:
        years = _calc_forecast(bm, override_years=force_years)
        forecasts[bm.building_name] = {yf.year: yf for yf in years}

    result: list[CombinedForecastYear] = []
    for year in range(min_year, max_year + 1):
        total_income = 0.0
        total_capex = 0.0
        total_opex = 0.0
        total_profit = 0.0
        bldg_map: dict[str, YearForecast] = {}
        for bm in buildings:
            yf = forecasts[bm.building_name].get(year)
            if yf:
                bldg_map[bm.building_name] = yf
                total_income += yf.annual_income
                total_capex += yf.capex
                total_opex += yf.annual_opex
                total_profit += yf.profit

        loan_repay = round(annual_loan, 2) if loan_start_year <= year <= loan_end_year else 0.0
        result.append(CombinedForecastYear(
            year=year,
            buildings=bldg_map,
            total_income=round(total_income, 2),
            total_capex=round(total_capex, 2),
            total_opex=round(total_opex, 2),
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
    years = _calc_forecast(bm, override_years=force_years)
    return BuildingForecastOut(
        building=BuildingModelOut.model_validate(bm),
        years=years,
        total_income=round(sum(y.annual_income for y in years), 2),
        total_capex=round(sum(y.capex for y in years), 2),
        total_opex=round(sum(y.annual_opex for y in years), 2),
        total_profit=round(sum(y.profit for y in years), 2),
    )
