"""רישום כל המודלים תחת Base."""
from app.models.task import Task
from app.models.tenant_agreement import TenantAgreement

__all__ = ["Task", "TenantAgreement"]
