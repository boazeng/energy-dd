"""סכמות Pydantic לתכנית העסקית."""
from pydantic import BaseModel, ConfigDict, Field


# ─── תוכן ערוך ────────────────────────────────────────────────────────────────

class SectionCreate(BaseModel):
    key: str
    order: int = 0
    level: int = Field(default=1, ge=1, le=3)
    title: str = ""
    body: str = ""
    data_block: str = ""
    visible: bool = True


class SectionUpdate(BaseModel):
    key: str | None = None
    order: int | None = None
    level: int | None = Field(default=None, ge=1, le=3)
    title: str | None = None
    body: str | None = None
    data_block: str | None = None
    visible: bool | None = None


class SectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    order: int
    level: int
    title: str
    body: str
    data_block: str
    visible: bool


class PlanSettingsIn(BaseModel):
    company_name: str | None = None
    doc_title: str | None = None
    submitted_to: str | None = None
    prepared_by: str | None = None
    doc_date: str | None = None
    horizon_years: int | None = Field(default=None, ge=1, le=30)
    contact_name: str | None = None
    contact_phone: str | None = None
    contact_email: str | None = None


class PlanSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    company_name: str
    doc_title: str
    submitted_to: str
    prepared_by: str
    doc_date: str
    horizon_years: int
    contact_name: str
    contact_phone: str
    contact_email: str


class BusinessPlanOut(BaseModel):
    settings: PlanSettingsOut
    sections: list[SectionOut]


# ─── נתונים מחושבים (snapshot חי) ─────────────────────────────────────────────

class OverviewData(BaseModel):
    """תמונת מצב תפעולית — כמה בניינים, מטענים ופוטנציאל."""

    buildings_count: int = 0
    cities: list[str] = []
    agreements_count: int = 0
    current_chargers: int = 0
    potential_spots: int = 0
    penetration_pct: float = 0          # מטענים מותקנים מתוך הפוטנציאל
    avg_contract_years: float = 0
    buildings: list[dict] = []          # שורה לכל בניין (או קבוצת HI GROUP)


class TodayData(BaseModel):
    """מצב היום — run-rate נוכחי, דוחות היסטוריים והתחייבויות."""

    run_rate_annual_income: float = 0   # הכנסה שנתית מהמטענים הקיימים
    run_rate_annual_opex: float = 0
    monthly_income_per_charger: float = 0
    opening_balance: float = 0
    opening_balance_date: str = ""
    supplier_credit_total: float = 0
    supplier_credits: list[dict] = []
    financials: dict = {}               # years / pnl / balance / flags — כפי שהם ב-JSON


class ForecastYearRow(BaseModel):
    year: int
    chargers_added: int = 0
    total_chargers: int = 0
    income: float = 0
    capex: float = 0
    opex: float = 0                     # OPEX חד-פעמי (שנה ראשונה)
    maintenance: float = 0
    ebitda: float = 0                   # הכנסות פחות OPEX ותחזוקה (לפני CAPEX והחזר)
    profit_before_loan: float = 0
    loan_repayment: float = 0
    net_profit: float = 0
    cumulative: float = 0
    dscr: float | None = None           # יחס כיסוי חוב; None כשאין החזר באותה שנה


class LoanData(BaseModel):
    amount: float = 0
    years: int = 0
    prime: float = 0
    margin: float = 0
    annual_rate: float = 0
    start_month: str = ""
    annual_payment: float = 0
    monthly_payment: float = 0
    total_repayment: float = 0
    total_interest: float = 0


class AssumptionRow(BaseModel):
    label: str
    value: str
    note: str = ""


class SensitivityRow(BaseModel):
    label: str
    growth_rate_pct: float
    total_profit: float
    min_cumulative: float
    final_cumulative: float


class PlanData(BaseModel):
    generated_at: str
    horizon_years: int
    start_year: int
    overview: OverviewData
    today: TodayData
    forecast: list[ForecastYearRow]
    totals: dict
    loan: LoanData
    assumptions: list[AssumptionRow]
    sensitivity: list[SensitivityRow]
