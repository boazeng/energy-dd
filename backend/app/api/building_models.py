"""נתיבי API לתזרים פר-בניין — CRUD + חישוב תחזית שנתית."""
import math

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.models.building_model import BuildingModel
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


def _calc_forecast(bm: BuildingModel) -> list[YearForecast]:
    """מחשב תחזית שנתית לבניין — גידול מטענים, הכנסות ו-CAPEX."""
    monthly_income_per_charger = (
        bm.mgmt_fee_per_charger
        + (bm.electricity_rate_agorot / 100) * bm.avg_kwh_per_charger_monthly
        + bm.subscription_fee_per_charger
    )
    unit_cost = bm.charger_purchase_cost + bm.charger_install_cost
    new_per_year = math.floor(bm.potential_spots * bm.annual_growth_rate / 100) if bm.potential_spots > 0 else 0

    total = bm.current_chargers
    years: list[YearForecast] = []

    for i in range(bm.forecast_years):
        remaining = max(0, bm.potential_spots - total)
        added = min(new_per_year, remaining)
        total += added
        capex = added * unit_cost
        annual_income = total * monthly_income_per_charger * 12
        years.append(YearForecast(
            year=bm.start_year + i,
            chargers_added=added,
            total_chargers=total,
            annual_income=round(annual_income, 2),
            capex=round(capex, 2),
            profit=round(annual_income - capex, 2),
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


# ─── תחזית ───────────────────────────────────────────────────────────────────

@router.get("/forecast/combined", response_model=list[CombinedForecastYear])
def combined_forecast(db: Session = Depends(get_db)):
    """תחזית מאוחדת לכל הבניינים — לפי שנה."""
    buildings = list(db.scalars(select(BuildingModel)))
    if not buildings:
        return []

    # מציאת טווח שנים מקסימלי
    min_year = min(b.start_year for b in buildings)
    max_year = max(b.start_year + b.forecast_years - 1 for b in buildings)

    # מיפוי תחזית לכל בניין
    forecasts: dict[str, dict[int, YearForecast]] = {}
    for bm in buildings:
        years = _calc_forecast(bm)
        forecasts[bm.building_name] = {yf.year: yf for yf in years}

    result: list[CombinedForecastYear] = []
    for year in range(min_year, max_year + 1):
        total_income = 0.0
        total_capex = 0.0
        total_profit = 0.0
        bldg_map: dict[str, YearForecast] = {}
        for bm in buildings:
            yf = forecasts[bm.building_name].get(year)
            if yf:
                bldg_map[bm.building_name] = yf
                total_income += yf.annual_income
                total_capex += yf.capex
                total_profit += yf.profit
        result.append(CombinedForecastYear(
            year=year,
            buildings=bldg_map,
            total_income=round(total_income, 2),
            total_capex=round(total_capex, 2),
            total_profit=round(total_profit, 2),
        ))

    return result


@router.get("/{bm_id}/forecast", response_model=BuildingForecastOut)
def building_forecast(bm_id: int, db: Session = Depends(get_db)):
    bm = db.get(BuildingModel, bm_id)
    if bm is None:
        raise HTTPException(status_code=404, detail="בניין לא נמצא")
    years = _calc_forecast(bm)
    return BuildingForecastOut(
        building=BuildingModelOut.model_validate(bm),
        years=years,
        total_income=round(sum(y.annual_income for y in years), 2),
        total_capex=round(sum(y.capex for y in years), 2),
        total_profit=round(sum(y.profit for y in years), 2),
    )
