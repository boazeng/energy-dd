"""זריעת ספקים ביתרת זכות מתוך מאזן בוחן 1-5/2026 — רק אם הטבלה ריקה."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.supplier_balance import SupplierBalance

SEED_SUPPLIERS: list[tuple[str, float]] = [
    ("ק.ל הנדסת חשמל בע\"מ",                        12281.00),
    ("ארכה בע\"מ",                                    6484.00),
    ("חברת פלאפון תקשורת בע\"מ",                     1393.72),
    ("חשמל ישיר",                                    4361.70),
    ("וויבו אנרג'י בע\"מ",                           25689.38),
    ("לוגנו ישראל (1988) בע\"מ",                    17700.00),
    ("א.נ אופק א.א פתרונות חשמל ותקשורת",             212.40),
]


def seed_supplier_balances(db: Session) -> int:
    """מוסיף ספקים רק אם הטבלה ריקה. מחזיר כמה נוספו."""
    if db.scalar(select(SupplierBalance.id).limit(1)) is not None:
        return 0
    db.add_all(
        SupplierBalance(supplier_name=name, balance=balance)
        for name, balance in SEED_SUPPLIERS
    )
    db.commit()
    return len(SEED_SUPPLIERS)
