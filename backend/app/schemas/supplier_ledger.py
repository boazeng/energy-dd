"""סכמות Pydantic לכרטסת ספקים."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SupplierLedgerCreate(BaseModel):
    supplier_name: str = Field(min_length=1, max_length=200)
    account_number: str = ""
    opening_balance: float = 0.0
    debit: float = Field(ge=0, default=0.0)
    credit: float = Field(ge=0, default=0.0)
    balance: float = 0.0


class SupplierLedgerUpdate(BaseModel):
    supplier_name: str | None = Field(default=None, min_length=1, max_length=200)
    account_number: str | None = None
    opening_balance: float | None = None
    debit: float | None = Field(default=None, ge=0)
    credit: float | None = Field(default=None, ge=0)
    balance: float | None = None
    completion: str | None = None


class SupplierLedgerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    supplier_name: str
    account_number: str
    opening_balance: float
    debit: float
    credit: float
    balance: float
    completion: str
    created_at: datetime
