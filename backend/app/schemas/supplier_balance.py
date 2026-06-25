"""סכמות Pydantic לספקי זכות."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SupplierBalanceCreate(BaseModel):
    supplier_name: str = Field(min_length=1, max_length=200)
    balance: float = Field(gt=0)
    note: str = ""


class SupplierBalanceUpdate(BaseModel):
    supplier_name: str | None = Field(default=None, min_length=1, max_length=200)
    balance: float | None = Field(default=None, gt=0)
    note: str | None = None


class SupplierBalanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    supplier_name: str
    balance: float
    note: str
    created_at: datetime
