"""סכמות Pydantic לתזרים פר-בניין."""
from pydantic import BaseModel, ConfigDict, Field


class ExtraCostItem(BaseModel):
    name: str = ""
    cost_per_charger: float = 0


class BuildingModelCreate(BaseModel):
    building_name: str
    current_chargers: int = 0
    potential_spots: int = 0
    annual_growth_rate: float = 0
    mgmt_fee_per_charger: float = 0
    electricity_rate_agorot: float = 0
    avg_kwh_per_charger_monthly: float = 0
    subscription_fee_per_charger: float = 0
    # CAPEX
    cost_charger_unit: float = 800
    cost_infra_per_charger: float = 1200
    cost_install_per_charger: float = 1300
    cost_elec_panel: float = 6000
    cost_comm_panel: float = 1000
    chargers_per_panel: int = 10
    # OPEX
    chargers_no_rcd: int = 0
    cost_rcd_per_charger: float = 300
    cost_internet_per_charger: float = 400
    cost_inspector_per_charger: float = 250
    extra_costs: list[ExtraCostItem] = []
    start_year: int = Field(default=2025, ge=2000, le=2100)
    forecast_years: int = Field(default=5, ge=1, le=30)


class BuildingModelUpdate(BaseModel):
    building_name: str | None = None
    current_chargers: int | None = None
    potential_spots: int | None = None
    annual_growth_rate: float | None = None
    mgmt_fee_per_charger: float | None = None
    electricity_rate_agorot: float | None = None
    avg_kwh_per_charger_monthly: float | None = None
    subscription_fee_per_charger: float | None = None
    # CAPEX
    cost_charger_unit: float | None = None
    cost_infra_per_charger: float | None = None
    cost_install_per_charger: float | None = None
    cost_elec_panel: float | None = None
    cost_comm_panel: float | None = None
    chargers_per_panel: int | None = None
    # OPEX
    chargers_no_rcd: int | None = None
    cost_rcd_per_charger: float | None = None
    cost_internet_per_charger: float | None = None
    cost_inspector_per_charger: float | None = None
    extra_costs: list[ExtraCostItem] | None = None
    start_year: int | None = Field(default=None, ge=2000, le=2100)
    forecast_years: int | None = Field(default=None, ge=1, le=30)


class BuildingModelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    building_name: str
    current_chargers: int
    potential_spots: int
    annual_growth_rate: float
    mgmt_fee_per_charger: float
    electricity_rate_agorot: float
    avg_kwh_per_charger_monthly: float
    subscription_fee_per_charger: float
    cost_charger_unit: float
    cost_infra_per_charger: float
    cost_install_per_charger: float
    cost_elec_panel: float
    cost_comm_panel: float
    chargers_per_panel: int
    chargers_no_rcd: int
    cost_rcd_per_charger: float
    cost_internet_per_charger: float
    cost_inspector_per_charger: float
    extra_costs: list[ExtraCostItem] = []
    start_year: int
    forecast_years: int


class YearForecast(BaseModel):
    year: int
    chargers_added: int
    total_chargers: int
    annual_income: float
    capex: float
    annual_opex: float
    profit: float


class BuildingForecastOut(BaseModel):
    building: BuildingModelOut
    years: list[YearForecast]
    total_income: float
    total_capex: float
    total_opex: float
    total_profit: float


class CombinedForecastYear(BaseModel):
    year: int
    buildings: dict[str, YearForecast]
    total_income: float
    total_capex: float
    total_opex: float
    total_profit: float
