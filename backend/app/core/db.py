"""חיבור מסד הנתונים (SQLite + SQLAlchemy 2.0)."""
from collections.abc import Generator

from sqlalchemy import create_engine
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
    """יוצר את הטבלאות (import של המודלים נדרש כדי לרשום אותם)."""
    from app import models  # noqa: F401  (רישום המודלים ב-Base)

    Base.metadata.create_all(bind=engine)
