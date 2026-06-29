"""סכמות Pydantic להסכמי דיירים."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Status = Literal["draft", "confirmed"]


class DetailSection(BaseModel):
    """סעיף בתצוגה המורחבת של החוזה."""
    title: str
    content: str


class TenantAgreementBase(BaseModel):
    tenant_name: str = ""
    building: str = ""
    address: str = ""
    units: str = ""
    term: str = ""
    payment: str = ""
    pricing_model: str = ""
    termination: str = ""
    summary: str = ""
    flags: str = ""
    charger_cost: str = ""
    notes: str = ""
    review_notes: str = ""
    details: list[DetailSection] = Field(default_factory=list)
    source_file: str = ""
    source_url: str = ""
    status: Status = "draft"


class TenantAgreementCreate(TenantAgreementBase):
    pass


class TenantAgreementUpdate(BaseModel):
    """עדכון חלקי."""
    tenant_name: str | None = None
    building: str | None = None
    address: str | None = None
    units: str | None = None
    term: str | None = None
    payment: str | None = None
    pricing_model: str | None = None
    termination: str | None = None
    summary: str | None = None
    flags: str | None = None
    charger_cost: str | None = None
    notes: str | None = None
    review_notes: str | None = None
    details: list[DetailSection] | None = None
    source_file: str | None = None
    source_url: str | None = None
    status: Status | None = None


class TenantAgreementOut(TenantAgreementBase):
    id: int
    created_at: datetime
