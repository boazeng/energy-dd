"""סכמות Pydantic למטלות (קלט/פלט ב-API)."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Category = Literal["tenant_agreement", "financial", "owners", "supplier_ledger"]
Status = Literal["open", "in_progress", "done", "blocked"]


class TaskCreate(BaseModel):
    category: Category
    title: str = Field(min_length=1, max_length=300)
    owner: str = ""
    note: str = ""


class TaskUpdate(BaseModel):
    """עדכון חלקי — כל השדות אופציונליים."""
    category: Category | None = None
    title: str | None = Field(default=None, min_length=1, max_length=300)
    status: Status | None = None
    owner: str | None = None
    note: str | None = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category: Category
    title: str
    status: Status
    owner: str
    note: str
    created_at: datetime
