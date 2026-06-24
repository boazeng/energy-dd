"""טבלת משתמשים מורשים — DB משותף לכל האפליקציות (auth.db)."""
import sqlite3
from pathlib import Path
from typing import Optional

ROLES = ("admin", "approver", "user")


def norm_email(email: str) -> str:
    """נרמול אימייל — אותיות קטנות וללא רווחים."""
    return (email or "").strip().lower()


class UserDB:
    """גישה לטבלת המשתמשים."""

    def __init__(self, db_path) -> None:
        self.db_path = str(db_path)
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init(self) -> None:
        with self._conn() as c:
            c.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    email          TEXT PRIMARY KEY,
                    name           TEXT NOT NULL DEFAULT '',
                    role           TEXT NOT NULL DEFAULT 'user',
                    active         INTEGER NOT NULL DEFAULT 1,
                    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_login_at  TIMESTAMP
                )
            """)

    def get(self, email: str) -> Optional[dict]:
        with self._conn() as c:
            row = c.execute("SELECT * FROM users WHERE email = ?",
                            (norm_email(email),)).fetchone()
        return dict(row) if row else None

    def list_all(self) -> list[dict]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM users ORDER BY (role='admin') DESC, role, email"
            ).fetchall()
        return [dict(r) for r in rows]

    def add_if_missing(self, email: str, role: str = "user", name: str = "") -> None:
        """מוסיף משתמש רק אם אינו קיים — לא דורס תפקיד קיים (לזריעה ראשונית)."""
        with self._conn() as c:
            c.execute(
                "INSERT OR IGNORE INTO users (email, name, role, active) VALUES (?, ?, ?, 1)",
                (norm_email(email), name, role if role in ROLES else "user"),
            )

    def upsert(self, email: str, role: str = "user", name: str = "",
               active: bool = True) -> None:
        """הוספה או עדכון מלא של משתמש."""
        with self._conn() as c:
            c.execute("""
                INSERT INTO users (email, name, role, active) VALUES (?, ?, ?, ?)
                ON CONFLICT(email) DO UPDATE SET
                    name = excluded.name, role = excluded.role, active = excluded.active
            """, (norm_email(email), name,
                  role if role in ROLES else "user", 1 if active else 0))

    def set_role(self, email: str, role: str) -> None:
        if role not in ROLES:
            raise ValueError(f"תפקיד לא חוקי: {role}")
        with self._conn() as c:
            c.execute("UPDATE users SET role = ? WHERE email = ?",
                      (role, norm_email(email)))

    def set_active(self, email: str, active: bool) -> None:
        with self._conn() as c:
            c.execute("UPDATE users SET active = ? WHERE email = ?",
                      (1 if active else 0, norm_email(email)))

    def delete(self, email: str) -> None:
        with self._conn() as c:
            c.execute("DELETE FROM users WHERE email = ?", (norm_email(email),))

    def touch_login(self, email: str) -> None:
        with self._conn() as c:
            c.execute("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE email = ?",
                      (norm_email(email),))

    def count_active_admins(self) -> int:
        """מספר ה-admin הפעילים — לשמירה מפני מחיקת ה-admin האחרון."""
        with self._conn() as c:
            return c.execute(
                "SELECT COUNT(*) FROM users WHERE role = 'admin' AND active = 1"
            ).fetchone()[0]
