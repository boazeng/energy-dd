"""חיבור מסד הנתונים (SQLite + SQLAlchemy 2.0)."""
from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},  # נדרש ל-SQLite עם FastAPI
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    """תלות FastAPI — מספקת session ומבטיחה סגירה."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """יוצר את הטבלאות ומריץ migrations קלים על עמודות חסרות."""
    from app import models  # noqa: F401  (רישום המודלים ב-Base)

    Base.metadata.create_all(bind=engine)
    _run_migrations()


def _run_migrations() -> None:
    """ALTER TABLE לעמודות שנוספו לאחר יצירת הטבלה."""
    _add_column_if_missing("supplier_ledger", "completion", "TEXT DEFAULT ''")
    _add_column_if_missing("supplier_ledger", "opening_balance", "REAL DEFAULT 0.0")
    _add_column_if_missing("tenant_agreements", "notes", "TEXT DEFAULT ''")
    _add_column_if_missing("tenant_agreements", "charger_cost", "TEXT DEFAULT ''")
    _refresh_supplier_ledger()


# (account_number, opening_balance, debit, credit, balance/closing)
# ערכים ישירים מכרטסת 1-5/2026 ללא חישובים
_LEDGER_DATA: list[tuple[str, float, float, float, float]] = [
    ("115",  10768.00,      0.00,      0.00,  10768.00),
    ("114",  26280.00,      0.00,      0.00,  26280.00),
    ("163", -12281.00,  12281.00,      0.00,      0.00),
    ("185",      0.00,      0.00,   6484.00,  -6484.00),
    ("186",     69.62,    348.10,    417.72,     69.62),
    ("188",      0.00,      0.00,   1393.72,  -1393.72),
    ("252",   -784.70,  15885.00,  20246.70,  -4361.70),
    ("255",      0.00,      0.00,   1933.34,   1933.34),
    ("257",  29780.64,   9920.68,  46875.18,  36954.50),
    ("360",  28143.80,      0.00,  40209.80,  40209.80),
    ("380",      0.00,   1835.00,   4185.28,   2350.28),
    ("447",   3674.80,      0.00,      0.00,   3674.80),
    ("450",   -531.00,    531.00,      0.00,      0.00),
    ("453",  -3493.98,   7172.28,  32861.66, -25689.38),
    ("454",      0.00,  32531.42,  50231.42, -17700.00),
    ("472",  38878.41,      0.00,  60323.84,  60323.84),
    ("489",  10000.00,      0.00,      0.00,  10000.00),
    ("492",      0.00,  10407.60,  10620.00,   -212.40),
]


def _refresh_supplier_ledger() -> None:
    """מעדכן נתוני כרטסת קיימים לפי מספר חשבון (opening_balance + balance)."""
    with engine.connect() as conn:
        for acc, opening, debit, credit, balance in _LEDGER_DATA:
            conn.execute(
                text(
                    "UPDATE supplier_ledger "
                    "SET opening_balance=:o, debit=:d, credit=:c, balance=:b "
                    "WHERE account_number=:acc"
                ),
                {"o": opening, "d": debit, "c": credit, "b": balance, "acc": acc},
            )
        conn.commit()


def _add_column_if_missing(table: str, column: str, col_def: str) -> None:
    with engine.connect() as conn:
        rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
        if rows and not any(r[1] == column for r in rows):
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}"))
            conn.commit()
