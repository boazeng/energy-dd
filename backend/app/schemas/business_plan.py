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
    acquisition_cost: float | None = Field(default=None, ge=0)
    target_company: str | None = None
    one_time_costs: list[dict] | None = None
    dc_annual_income: float | None = Field(default=None, ge=0)
    dc_income_start_year: int | None = Field(default=None, ge=2000, le=2100)


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
    acquisition_cost: float = 0
    target_company: str = ""
    one_time_costs: list[dict] = []
    dc_annual_income: float = 0
    dc_income_start_year: int = 2028


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
    income: float = 0                   # סה"כ הכנסות השנה, כולל מטעני DC
    dc_income: float = 0                # מתוכן: הכנסה ממטעני DC (0 לפני שנת ההפעלה)
    capex: float = 0
    opex: float = 0                     # OPEX חד-פעמי (שנה ראשונה)
    maintenance: float = 0
    overhead: float = 0                 # תקורות שנתיות (מלשונית תזרים בניינים)
    ebitda: float = 0                   # הכנסות פחות OPEX ותחזוקה (לפני CAPEX והחזר)
    profit_before_loan: float = 0
    loan_repayment: float = 0           # קרן וריבית יחד — כך זה יוצא מהתזרים
    net_profit: float = 0
    # ── רווח והפסד: אותה פעילות, בלי החזר הקרן ────────────────────────────
    loan_interest: float = 0            # רכיב הריבית בהחזר — הוצאת מימון
    loan_principal: float = 0           # רכיב הקרן — פירעון התחייבות, לא הוצאה
    pretax_profit: float = 0            # profit_before_loan פחות הריבית
    corporate_tax: float = 0            # 23% מהרווח לפני מס, ורק כשהוא חיובי
    net_income: float = 0               # רווח נקי לאחר מס חברות
    cumulative: float = 0               # לפני מס, כמו התרשימים וניתוח הרגישות
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


class AgreementRow(BaseModel):
    """שורה במרשם ההסכמים — הנכס המרכזי הנרכש."""

    building: str = ""
    tenant_name: str = ""
    units: str = ""
    term: str = ""
    payment: str = ""
    pricing_model: str = ""
    charger_cost: str = ""
    termination: str = ""
    linked_buildings: list[str] = []    # אתרים ב-building_models המקושרים להסכם


class SiteEconomics(BaseModel):
    """הכלכלה של אתר בודד — מה בדיוק נרכש בכל אתר."""

    name: str = ""
    city: str = ""
    members: list[str] = []
    current_chargers: int = 0
    potential_spots: int = 0
    mgmt_fee: float = 0
    elec_rate_agorot: float = 0
    avg_kwh: float = 0
    subscription: float = 0
    install_income: float = 0
    monthly_income_per_charger: float = 0
    current_annual_income: float = 0
    potential_annual_income: float = 0   # אילו כל החניות היו מאוישות
    contract_start_year: int | None = None
    contract_duration_years: int | None = None


class AcquisitionData(BaseModel):
    """מקורות ושימושים לעסקת הרכישה — הבסיס לבחינת הבנק."""

    target_company: str = ""
    cost: float = 0                     # עלות הרכישה
    # שימושים חד-פעמיים נוספים בעסקה. כמו עלות הרכישה — ממומנים מההלוואה
    # ואינם מנוכים מהתזרים.
    one_time_costs: list[dict] = []
    one_time_total: float = 0
    total_uses: float = 0               # cost + one_time_total
    credit_requested: float = 0         # האשראי המבוקש (= cashflow_loan.amount)
    equity_required: float = 0          # total_uses − credit, כשחיובי
    surplus_working_capital: float = 0  # credit − total_uses, כשחיובי
    buildings: int = 0
    chargers: int = 0
    potential_spots: int = 0
    cost_per_building: float = 0
    cost_per_potential_spot: float = 0  # עלות לכל חניה בפוטנציאל החוזי
    multiple_on_run_rate: float | None = None  # עלות ÷ הכנסה שנתית נוכחית


class AssumptionRow(BaseModel):
    group: str = ""     # כותרת קבוצה בטבלה; מקביל לעמודות פאנל ההגדרות
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
    by_contract: bool = False   # האופק נגזר מתקופת ההסכם בכל אתר בנפרד
    overview: OverviewData
    today: TodayData
    acquisition: AcquisitionData
    agreements: list[AgreementRow]
    sites: list[SiteEconomics]
    forecast: list[ForecastYearRow]
    totals: dict
    loan: LoanData
    assumptions: list[AssumptionRow]
    sensitivity: list[SensitivityRow]
