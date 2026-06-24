"""רישום כל המודלים תחת Base."""
from app.models.cashflow import CashflowItem, CashflowLoan, CashflowSetting
from app.models.task import Task
from app.models.tenant_agreement import TenantAgreement

__all__ = ["Task", "TenantAgreement", "CashflowItem", "CashflowSetting", "CashflowLoan"]
