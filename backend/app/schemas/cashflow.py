"""סכמות Pydantic לתזרים."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Type = Literal["income", "expense"]
Recurrence = Literal["monthly", "quarterly", "annual", "one-time"]


class CashflowItemCreate(BaseModel):
    name: str = ""
    type: Type = "expense"
    category: str = ""
    amount: float = 0
    recurrence: Recurrence = "monthly"
    day_of_month: int = Field(default=1, ge=1, le=31)
    start_month: str = ""   # YYYY-MM
    end_month: str = ""
    note: str = ""


class CashflowItemUpdate(BaseModel):
    """עדכון חלקי — כל השדות אופציונליים."""
    name: str | None = None
    type: Type | None = None
    category: str | None = None
    amount: float | None = None
    recurrence: Recurrence | None = None
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    start_month: str | None = None
    end_month: str | None = None
    note: str | None = None


class CashflowItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: Type
    category: str
    amount: float
    recurrence: Recurrence
    day_of_month: int
    start_month: str
    end_month: str
    note: str


class CashflowSettingsIn(BaseModel):
    opening_balance: float = 0
    balance_date: str = ""


class CashflowSettingsOut(CashflowSettingsIn):
    model_config = ConfigDict(from_attributes=True)


class CashflowLoanIn(BaseModel):
    """עדכון חלקי של פרמטרי ההלוואה."""
    amount: float | None = None
    years: int | None = Field(default=None, ge=1, le=30)
    prime: float | None = None
    margin: float | None = None
    start_month: str | None = None


class CashflowLoanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    amount: float
    years: int
    prime: float
    margin: float
    start_month: str


class CashflowOut(BaseModel):
    items: list[CashflowItemOut]
    settings: CashflowSettingsOut
    loan: CashflowLoanOut
