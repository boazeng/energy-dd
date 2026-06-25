"""רישום כל המודלים תחת Base."""
from app.models.building_model import BuildingModel
from app.models.cashflow import CashflowItem, CashflowLoan, CashflowSetting
from app.models.question import Question
from app.models.supplier_balance import SupplierBalance
from app.models.supplier_ledger import SupplierLedgerRow
from app.models.task import Task
from app.models.tenant_agreement import TenantAgreement

__all__ = [
    "Task", "TenantAgreement",
    "CashflowItem", "CashflowSetting", "CashflowLoan",
    "SupplierBalance", "SupplierLedgerRow", "BuildingModel",
    "Question",
]
