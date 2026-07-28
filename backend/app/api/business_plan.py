"""נתיבי API לתכנית עסקית.

שני חלקים נפרדים:
  • תוכן ערוך  — פרקים והגדרות מסמך שנשמרים ב-DB ונערכים מהאתר.
  • נתונים חיים — `GET /data` מרכיב snapshot אחד מכל מקורות האמת של המערכת
    (building_models, cashflow, financials, ספקים, הסכמים). המסמך אף פעם לא
    שומר מספרים, ולכן הוא תמיד תואם למה שרואים בשאר הלשוניות.
"""
import json
from datetime import date, datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.building_models import _calc_forecast, _shpitzer_annual
from app.api.cashflow import _get_loan, _get_settings as _get_cashflow_settings
from app.core.config import settings as app_settings
from app.core.db import get_db
from app.models.building_model import BuildingModel
from app.models.business_plan import BusinessPlanSection, BusinessPlanSetting
from app.models.supplier_balance import SupplierBalance
from app.models.tenant_agreement import TenantAgreement
from app.schemas.business_plan import (
    AcquisitionData,
    AgreementRow,
    AssumptionRow,
    BusinessPlanOut,
    ForecastYearRow,
    LoanData,
    OverviewData,
    PlanData,
    PlanSettingsIn,
    PlanSettingsOut,
    SectionCreate,
    SectionOut,
    SectionUpdate,
    SensitivityRow,
    SiteEconomics,
    TodayData,
)

router = APIRouter(prefix="/api/business-plan", tags=["business-plan"])


# ─── תוכן ערוך ────────────────────────────────────────────────────────────────

def _get_settings(db: Session) -> BusinessPlanSetting:
    s = db.get(BusinessPlanSetting, 1)
    if s is None:
        s = BusinessPlanSetting(id=1)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


@router.get("", response_model=BusinessPlanOut)
def get_plan(db: Session = Depends(get_db)):
    sections = list(
        db.scalars(
            select(BusinessPlanSection).order_by(
                BusinessPlanSection.order, BusinessPlanSection.id
            )
        )
    )
    return {"settings": _get_settings(db), "sections": sections}


@router.put("/settings", response_model=PlanSettingsOut)
def update_settings(payload: PlanSettingsIn, db: Session = Depends(get_db)):
    s = _get_settings(db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(s, field, value)
    db.commit()
    db.refresh(s)
    return s


@router.post("/sections", response_model=SectionOut, status_code=201)
def create_section(payload: SectionCreate, db: Session = Depends(get_db)):
    if db.scalar(select(BusinessPlanSection).where(BusinessPlanSection.key == payload.key)):
        raise HTTPException(status_code=409, detail="מפתח פרק כבר קיים")
    sec = BusinessPlanSection(**payload.model_dump())
    db.add(sec)
    db.commit()
    db.refresh(sec)
    return sec


@router.patch("/sections/{sec_id}", response_model=SectionOut)
def update_section(sec_id: int, payload: SectionUpdate, db: Session = Depends(get_db)):
    sec = db.get(BusinessPlanSection, sec_id)
    if sec is None:
        raise HTTPException(status_code=404, detail="פרק לא נמצא")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(sec, field, value)
    db.commit()
    db.refresh(sec)
    return sec


@router.delete("/sections/{sec_id}", status_code=204)
def delete_section(sec_id: int, db: Session = Depends(get_db)):
    sec = db.get(BusinessPlanSection, sec_id)
    if sec is None:
        raise HTTPException(status_code=404, detail="פרק לא נמצא")
    db.delete(sec)
    db.commit()


# ─── עזר לנתונים החיים ────────────────────────────────────────────────────────

def _city_of(building_name: str) -> str:
    """שם הבניין נשמר כ-'רחוב מספר, עיר' — מחלצים את העיר."""
    parts = [p.strip() for p in (building_name or "").split(",")]
    return parts[-1] if len(parts) > 1 else ""


def _monthly_income_per_charger(bm: BuildingModel) -> float:
    return (
        bm.mgmt_fee_per_charger
        + (bm.electricity_rate_agorot / 100) * bm.avg_kwh_per_charger_monthly
        + bm.subscription_fee_per_charger
    )


def _aggregate(
    buildings: list[BuildingModel],
    horizon: int,
    growth_factor: float = 1.0,
) -> dict[int, dict[str, float]]:
    """מסכם את תחזיות כל הבניינים לשנה קלנדרית אחת. מפתח = שנה."""
    agg: dict[int, dict[str, float]] = {}
    for bm in buildings:
        override = None if growth_factor == 1.0 else bm.annual_growth_rate * growth_factor
        for yf in _calc_forecast(bm, override_years=horizon, growth_override=override):
            row = agg.setdefault(
                yf.year,
                {"added": 0.0, "total": 0.0, "income": 0.0, "capex": 0.0, "opex": 0.0, "maint": 0.0},
            )
            row["added"] += yf.chargers_added
            row["total"] += yf.total_chargers
            row["income"] += yf.annual_income
            row["capex"] += yf.capex
            row["opex"] += yf.annual_opex
            row["maint"] += yf.maintenance_opex
    return agg


def _load_financials() -> dict:
    path = Path(app_settings.financials_data_path)
    if not path.is_file():
        return {}
    try:
        with path.open(encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


# ─── נתונים חיים ──────────────────────────────────────────────────────────────

@router.get("/data", response_model=PlanData)
def get_plan_data(
    years: int | None = Query(None, ge=1, le=30, description="אופק; ברירת מחדל מההגדרות"),
    overhead: float = Query(
        0, ge=0,
        description="סה\"כ תקורות שנתיות. נשמר ב-localStorage של לשונית תזרים בניינים "
                    "ולכן חייב להגיע מהדפדפן — בלעדיו התחזית מנפחת את הרווח מול אותה לשונית.",
    ),
    db: Session = Depends(get_db),
):
    """snapshot אחד ועקבי של כל המספרים במסמך, מחושב מהנתונים החיים."""
    plan_settings = _get_settings(db)
    horizon = years or plan_settings.horizon_years

    buildings = list(db.scalars(select(BuildingModel).order_by(BuildingModel.building_name)))
    agreements = list(db.scalars(select(TenantAgreement)))

    start_year = min((b.start_year for b in buildings), default=date.today().year)

    # ── פרק 1: תמונה תפעולית ──────────────────────────────────────────────
    # בניינים תחת אותה קבוצה (HI GROUP) מוצגים כשורה אחת, כמו בשאר האתר.
    groups: dict[str, dict] = {}
    for bm in buildings:
        gkey = bm.hi_group or bm.building_name
        g = groups.setdefault(
            gkey,
            {
                "name": gkey,
                "members": [],
                "city": _city_of(bm.building_name),
                "current_chargers": 0,
                "potential_spots": 0,
                "contract_start_year": bm.contract_start_year,
                "contract_duration_years": bm.contract_duration_years,
                "mgmt_fee": bm.mgmt_fee_per_charger,
                "elec_rate": bm.electricity_rate_agorot,
                "avg_kwh": bm.avg_kwh_per_charger_monthly,
                "subscription": bm.subscription_fee_per_charger,
                "install_income": bm.charger_install_income,
                "monthly_income": _monthly_income_per_charger(bm),
                "growth_rate": bm.annual_growth_rate,
            },
        )
        g["members"].append(bm.building_name)
        g["current_chargers"] += bm.current_chargers
        g["potential_spots"] += bm.potential_spots

    total_current = sum(b.current_chargers for b in buildings)
    total_potential = sum(b.potential_spots for b in buildings)
    durations = [b.contract_duration_years for b in buildings if b.contract_duration_years]

    overview = OverviewData(
        buildings_count=len(buildings),
        cities=sorted({c for c in (_city_of(b.building_name) for b in buildings) if c}),
        agreements_count=len(agreements),
        current_chargers=total_current,
        potential_spots=total_potential,
        penetration_pct=round(total_current / total_potential * 100, 1) if total_potential else 0,
        avg_contract_years=round(sum(durations) / len(durations), 1) if durations else 0,
        buildings=sorted(groups.values(), key=lambda g: -g["potential_spots"]),
    )

    # ── פרק 2: מצב היום ───────────────────────────────────────────────────
    cf_settings = _get_cashflow_settings(db)
    supplier_rows = list(db.scalars(select(SupplierBalance)))

    # run-rate = ההכנסה השנתית מהמטענים שכבר מותקנים, ללא שום גידול
    run_rate_income = sum(
        b.current_chargers * _monthly_income_per_charger(b) * 12 for b in buildings
    )
    run_rate_opex = sum(
        b.current_chargers
        * (b.cost_internet_per_charger + b.cost_inspector_per_charger + b.cost_maintenance_per_charger)
        + min(b.chargers_no_rcd, b.current_chargers) * b.cost_rcd_per_charger
        for b in buildings
    )

    today = TodayData(
        run_rate_annual_income=round(run_rate_income, 2),
        run_rate_annual_opex=round(run_rate_opex, 2),
        monthly_income_per_charger=round(run_rate_income / 12 / total_current, 2) if total_current else 0,
        opening_balance=cf_settings.opening_balance,
        opening_balance_date=cf_settings.balance_date,
        supplier_credit_total=round(sum(r.balance for r in supplier_rows), 2),
        supplier_credits=[{"name": r.supplier_name, "balance": r.balance} for r in supplier_rows],
        financials=_load_financials(),
    )

    # ── מרשם ההסכמים והכלכלה פר-אתר: מה בדיוק נרכש ───────────────────────
    # שני המרשמים נשלפים חיים; מודעת ההסכמים היא הנכס המרכזי בעסקה.
    by_agreement: dict[int, list[str]] = {}
    for bm in buildings:
        if bm.agreement_id:
            by_agreement.setdefault(bm.agreement_id, []).append(bm.building_name)

    agreement_rows = [
        AgreementRow(
            building=a.building,
            tenant_name=a.tenant_name,
            units=a.units,
            term=a.term,
            payment=a.payment,
            pricing_model=a.pricing_model,
            charger_cost=a.charger_cost,
            termination=a.termination,
            linked_buildings=sorted(by_agreement.get(a.id, [])),
        )
        for a in sorted(agreements, key=lambda x: x.building or "")
    ]

    sites = [
        SiteEconomics(
            name=g["name"],
            city=g["city"],
            members=sorted(g["members"]),
            current_chargers=g["current_chargers"],
            potential_spots=g["potential_spots"],
            mgmt_fee=g["mgmt_fee"],
            elec_rate_agorot=g["elec_rate"],
            avg_kwh=g["avg_kwh"],
            subscription=g["subscription"],
            install_income=g["install_income"],
            monthly_income_per_charger=round(g["monthly_income"], 2),
            current_annual_income=round(g["current_chargers"] * g["monthly_income"] * 12, 2),
            potential_annual_income=round(g["potential_spots"] * g["monthly_income"] * 12, 2),
            contract_start_year=g["contract_start_year"],
            contract_duration_years=g["contract_duration_years"],
        )
        for g in sorted(groups.values(), key=lambda x: -x["potential_spots"])
    ]

    # ── עסקת הרכישה: מקורות ושימושים ─────────────────────────────────────
    loan_row = _get_loan(db)
    cost = plan_settings.acquisition_cost or 0
    credit = loan_row.amount or 0
    acquisition = AcquisitionData(
        target_company=plan_settings.target_company,
        cost=cost,
        credit_requested=credit,
        equity_required=round(max(0.0, cost - credit), 2),
        surplus_working_capital=round(max(0.0, credit - cost), 2),
        buildings=len(buildings),
        chargers=total_current,
        potential_spots=total_potential,
        cost_per_building=round(cost / len(buildings), 2) if buildings else 0,
        cost_per_charger=round(cost / total_current, 2) if total_current else 0,
        cost_per_potential_spot=round(cost / total_potential, 2) if total_potential else 0,
        multiple_on_run_rate=(
            round(cost / run_rate_income, 1) if run_rate_income > 0 else None
        ),
    )

    # ── פרק 3: תחזית ──────────────────────────────────────────────────────
    annual_payment = _shpitzer_annual(loan_row)
    loan_start = int(loan_row.start_month[:4]) if loan_row.start_month else start_year
    loan_end = loan_start + loan_row.years - 1

    agg = _aggregate(buildings, horizon)
    cumulative = today.opening_balance
    forecast: list[ForecastYearRow] = []
    for year in sorted(agg):
        r = agg[year]
        profit_before_loan = r["income"] - r["capex"] - r["opex"] - r["maint"] - overhead
        repayment = round(annual_payment, 2) if loan_start <= year <= loan_end else 0.0
        net = profit_before_loan - repayment
        cumulative += net
        forecast.append(ForecastYearRow(
            year=year,
            chargers_added=int(r["added"]),
            total_chargers=int(r["total"]),
            income=round(r["income"], 2),
            capex=round(r["capex"], 2),
            opex=round(r["opex"], 2),
            maintenance=round(r["maint"], 2),
            overhead=round(overhead, 2),
            ebitda=round(r["income"] - r["opex"] - r["maint"] - overhead, 2),
            profit_before_loan=round(profit_before_loan, 2),
            loan_repayment=repayment,
            net_profit=round(net, 2),
            cumulative=round(cumulative, 2),
            dscr=round(profit_before_loan / repayment, 2) if repayment > 0 else None,
        ))

    totals = {
        "income": round(sum(f.income for f in forecast), 2),
        "capex": round(sum(f.capex for f in forecast), 2),
        "opex": round(sum(f.opex for f in forecast), 2),
        "maintenance": round(sum(f.maintenance for f in forecast), 2),
        "overhead": round(sum(f.overhead for f in forecast), 2),
        "profit_before_loan": round(sum(f.profit_before_loan for f in forecast), 2),
        "loan_repayment": round(sum(f.loan_repayment for f in forecast), 2),
        "net_profit": round(sum(f.net_profit for f in forecast), 2),
        "chargers_added": sum(f.chargers_added for f in forecast),
        "chargers_end": forecast[-1].total_chargers if forecast else total_current,
        "final_cumulative": forecast[-1].cumulative if forecast else today.opening_balance,
        "min_cumulative": min((f.cumulative for f in forecast), default=today.opening_balance),
    }

    monthly = annual_payment / 12
    loan = LoanData(
        amount=loan_row.amount,
        years=loan_row.years,
        prime=loan_row.prime,
        margin=loan_row.margin,
        annual_rate=round(loan_row.prime + loan_row.margin, 2),
        start_month=loan_row.start_month or "",
        annual_payment=round(annual_payment, 2),
        monthly_payment=round(monthly, 2),
        total_repayment=round(annual_payment * loan_row.years, 2),
        total_interest=round(annual_payment * loan_row.years - loan_row.amount, 2),
    )

    # ── הנחות עבודה — הערכים בפועל מהמודל, לא מספרים כתובים ביד ─────────
    def _wavg(attr: str) -> float:
        """ממוצע משוקלל לפי מספר החניות הפוטנציאליות."""
        weight = sum(b.potential_spots for b in buildings)
        if not weight:
            return 0
        return sum(getattr(b, attr) * b.potential_spots for b in buildings) / weight

    def _money(v: float) -> str:
        return f"₪{v:,.0f}" if abs(v - round(v)) < 0.005 else f"₪{v:,.2f}"

    def _uniform(attr: str) -> float | None:
        """הערך אם הוא זהה בכל האתרים, אחרת None.

        פאנל ההגדרות הגלובלי מחיל את רוב הפרמטרים על כל הבניינים יחד, ולכן
        בדרך כלל יש ערך אחד מדויק. אם מישהו שינה בניין בודד — נופלים לממוצע
        משוקלל, וההערה בטבלה אומרת זאת במפורש.
        """
        if not buildings:
            return None
        vals = {round(getattr(b, attr), 4) for b in buildings}
        return vals.pop() if len(vals) == 1 else None

    def _param(group: str, label: str, attr: str, fmt, note: str = "") -> AssumptionRow:
        exact = _uniform(attr)
        val = exact if exact is not None else _wavg(attr)
        src = note or ("חל על כל האתרים" if exact is not None else "ממוצע משוקלל — הערך אינו אחיד בין האתרים")
        return AssumptionRow(group=group, label=label, value=fmt(val), note=src)

    _ils = _money
    _pct = lambda v: f"{v:,.1f}%"                    # noqa: E731
    _kwh = lambda v: f'{v:,.0f} קוט"ש'               # noqa: E731
    _ag = lambda v: f"{v:,.1f} אג'"                  # noqa: E731
    _int = lambda v: f"{v:,.0f}"                     # noqa: E731

    G1, G2, G3, G4, G5, G6 = (
        "הנחות יסוד", "הכנסה חודשית למטען", "עלות התקנת מטען חדש (CAPEX)",
        "עלויות התאמה למטענים קיימים", "תפעול שוטף", "מימון ורכישה",
    )

    assumptions: list[AssumptionRow] = [
        AssumptionRow(group=G1, label="אופק התחזית", value=f"{horizon} שנים",
                      note=f"{start_year}–{start_year + horizon - 1}"),
        _param(G1, "שיעור גידול שנתי", "annual_growth_rate", _pct,
               note="מטענים חדשים כאחוז מהחניות הפוטנציאליות בכל אתר"),
        _param(G1, "צריכה חודשית ממוצעת למטען", "avg_kwh_per_charger_monthly", _kwh),

        _param(G2, "דמי ניהול", "mgmt_fee_per_charger", _ils),
        _param(G2, 'תוספת על תעריף החשמל (לקוט"ש)', "electricity_rate_agorot", _ag),
        _param(G2, "דמי מנוי", "subscription_fee_per_charger", _ils),
        _param(G2, "הכנסה חד-פעמית מהתקנה", "charger_install_income", _ils,
               note="לפי ההסכם מול הדייר; נזקפת בשנה שבה הותקן המטען"),

        _param(G3, "עלות המטען", "cost_charger_unit", _ils),
        _param(G3, "תשתית חשמל ותקשורת", "cost_infra_per_charger", _ils),
        _param(G3, "התקנה", "cost_install_per_charger", _ils),
        _param(G3, "ארון חשמל", "cost_elec_panel", _ils, note="מתחלק במספר המטענים לארון"),
        _param(G3, "ארון תקשורת", "cost_comm_panel", _ils, note="מתחלק במספר המטענים לארון"),
        _param(G3, "מטענים לארון", "chargers_per_panel", _int),

        _param(G4, "פחת חסר (RCD)", "cost_rcd_per_charger", _ils,
               note="חד-פעמי בשנה הראשונה, רק למטענים קיימים ללא RCD"),
        _param(G4, "אינטרנט", "cost_internet_per_charger", _ils, note="חד-פעמי בשנה הראשונה, למטענים קיימים"),
        _param(G4, "אישור בודק חשמל", "cost_inspector_per_charger", _ils, note="חד-פעמי בשנה הראשונה, למטענים קיימים"),

        _param(G5, "תחזוקה שנתית למטען", "cost_maintenance_per_charger", _ils, note="לכל מטען פעיל, בכל שנה"),
        AssumptionRow(group=G5, label="הוצאות תקורה שנתיות", value=_money(overhead),
                      note="כמוגדר בלשונית תזרים בניינים" if overhead else
                           "לא הוגדרו תקורות בלשונית תזרים בניינים"),
    ]

    # סה"כ CAPEX למטען — הסכום שבאמת נכנס לתחזית
    if buildings:
        b0 = buildings[0]
        panel = b0.cost_elec_panel + b0.cost_comm_panel
        per_panel = max(1, b0.chargers_per_panel)
        total_capex = (
            b0.cost_charger_unit + b0.cost_infra_per_charger + b0.cost_install_per_charger
            + panel / per_panel
        )
        assumptions.insert(
            next(i for i, a in enumerate(assumptions) if a.group == G4),
            AssumptionRow(group=G3, label='סה"כ השקעה למטען חדש', value=_money(total_capex),
                          note="סכום הרכיבים שמעל, כולל חלק יחסי בארונות"),
        )

    assumptions += [
        AssumptionRow(group=G6, label="עלות הרכישה", value=_money(acquisition.cost),
                      note=f"{acquisition.buildings} אתרים · {_money(acquisition.cost_per_building)} לאתר"),
        AssumptionRow(group=G6, label="אשראי מבוקש", value=_money(loan.amount),
                      note=f"{loan.years} שנים · פריים {loan.prime}% + מרווח {loan.margin}% · לוח שפיצר"),
        AssumptionRow(group=G6, label="החזר שנתי", value=_money(loan.annual_payment),
                      note=f"{_money(loan.monthly_payment)} לחודש"),
        AssumptionRow(group=G6, label="יתרת מזומנים לתחילת התקופה", value=_money(today.opening_balance),
                      note=today.opening_balance_date or "לפי לשונית תזרים"),
        AssumptionRow(group=G6, label='מע"מ', value="מנוטרל", note="כל הסכומים בתכנית אינם כוללים מע\"מ"),
    ]

    # ── רגישות — קצב חדירה איטי/מהיר מהמתוכנן ─────────────────────────────
    sensitivity: list[SensitivityRow] = []
    for label, factor in [
        ("איטי ב-50%", 0.5),
        ("איטי ב-25%", 0.75),
        ("תרחיש הבסיס", 1.0),
        ("מהיר ב-25%", 1.25),
        ("מהיר ב-50%", 1.5),
    ]:
        scen = _aggregate(buildings, horizon, growth_factor=factor)
        cum = today.opening_balance
        cums: list[float] = []
        total_profit = 0.0
        for year in sorted(scen):
            r = scen[year]
            pbl = r["income"] - r["capex"] - r["opex"] - r["maint"] - overhead
            repay = annual_payment if loan_start <= year <= loan_end else 0.0
            total_profit += pbl - repay
            cum += pbl - repay
            cums.append(cum)
        sensitivity.append(SensitivityRow(
            label=label,
            growth_rate_pct=round(_wavg("annual_growth_rate") * factor, 1),
            total_profit=round(total_profit, 2),
            min_cumulative=round(min(cums), 2) if cums else 0,
            final_cumulative=round(cums[-1], 2) if cums else 0,
        ))

    return PlanData(
        generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        horizon_years=horizon,
        start_year=start_year,
        overview=overview,
        today=today,
        acquisition=acquisition,
        agreements=agreement_rows,
        sites=sites,
        forecast=forecast,
        totals=totals,
        loan=loan,
        assumptions=assumptions,
        sensitivity=sensitivity,
    )
