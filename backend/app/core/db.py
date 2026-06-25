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
    _add_column_if_missing("tenant_agreements", "notes", "TEXT DEFAULT ''")


def _add_column_if_missing(table: str, column: str, col_def: str) -> None:
    with engine.connect() as conn:
        rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
        if rows and not any(r[1] == column for r in rows):
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}"))
            conn.commit()
