"""מיגרציות ידניות לטבלאות קיימות (SQLite ללא Alembic)."""
from sqlalchemy import Engine, text


def migrate_building_models(engine: Engine) -> None:
    """הוסף עמודות OPEX ו-CAPEX מפורטות ל-building_models אם חסרות."""
    new_cols = [
        # OPEX (נוספו בשלב א — ייתכן שחסרות ב-DB ישן)
        ("chargers_no_rcd",           "INTEGER",  0),
        ("cost_rcd_per_charger",      "REAL",    300),
        ("cost_internet_per_charger", "REAL",    400),
        ("cost_inspector_per_charger","REAL",    250),
        # CAPEX מפורט (החליף charger_purchase_cost + charger_install_cost)
        ("cost_charger_unit",         "REAL",    800),
        ("cost_infra_per_charger",    "REAL",   1200),
        ("cost_install_per_charger",  "REAL",   1300),
        ("cost_elec_panel",           "REAL",   6000),
        ("cost_comm_panel",           "REAL",   1000),
        ("chargers_per_panel",        "INTEGER",  10),
    ]
    with engine.connect() as conn:
        existing = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info(building_models)"))
        }
        # הסר עמודות legacy שהוחלפו ב-CAPEX המפורט. הן הוגדרו NOT NULL ללא default,
        # ולכן INSERT של בניין חדש (seed) נכשל עליהן. SQLite תומך DROP COLUMN.
        for legacy in ("charger_purchase_cost", "charger_install_cost"):
            if legacy in existing:
                try:
                    conn.execute(text(f"ALTER TABLE building_models DROP COLUMN {legacy}"))
                    existing.discard(legacy)
                except Exception:  # noqa: BLE001 — מיגרציה best-effort
                    pass
        for col_name, col_type, default in new_cols:
            if col_name not in existing:
                conn.execute(text(
                    f"ALTER TABLE building_models ADD COLUMN {col_name} {col_type} DEFAULT {default}"
                ))
        # הכנסה מהתקנת מטען חדש
        if "charger_install_income" not in existing:
            conn.execute(text("ALTER TABLE building_models ADD COLUMN charger_install_income REAL DEFAULT 0"))
        # עמודת עלויות נוספות (JSON)
        if "extra_costs" not in existing:
            conn.execute(text("ALTER TABLE building_models ADD COLUMN extra_costs TEXT DEFAULT '[]'"))
        # פרטי הסכם פר-בניין (NULL = לא הוגדר, משתמשים ב-forecast_years)
        if "contract_start_year" not in existing:
            conn.execute(text("ALTER TABLE building_models ADD COLUMN contract_start_year INTEGER NULL"))
        if "contract_duration_years" not in existing:
            conn.execute(text("ALTER TABLE building_models ADD COLUMN contract_duration_years INTEGER NULL"))
        if "notes" not in existing:
            conn.execute(text("ALTER TABLE building_models ADD COLUMN notes TEXT DEFAULT ''"))
        # עדכן start_year ל-2026 בכל הרשומות הקיימות (שנת התחלה = מצב נוכחי)
        conn.execute(text("UPDATE building_models SET start_year = 2026 WHERE start_year = 2025"))
        # תיקוני שמות בניינים (typo/קיצור). פרמטרים מקושרים (נמנעים מ-escaping של גרש),
        # ועמידות בפני כפילות: אם השם המתוקן כבר קיים בשורה אחרת, מוחקים את שורת ה-typo
        # (building_models.building_name הוא UNIQUE — שינוי-שם לכפילות מפיל את האפליקציה).
        for _old, _new, _like in [
            ("גן עמר 4A", "ג'ו עמר 4A", "%גן עמר 4A%"),
            ("שד׳ היובל",  "שדרות היובל", "%שד׳ היובל%"),
        ]:
            p = {"old": _old, "new": _new, "like": _like}
            conn.execute(text(
                "DELETE FROM building_models WHERE building_name LIKE :like AND EXISTS ("
                " SELECT 1 FROM building_models b WHERE b.id <> building_models.id"
                " AND b.building_name = REPLACE(building_models.building_name, :old, :new))"
            ), p)
            conn.execute(text(
                "UPDATE building_models SET building_name = REPLACE(building_name, :old, :new)"
                " WHERE building_name LIKE :like"
            ), p)
            conn.execute(text(
                "UPDATE tenant_agreements SET building = REPLACE(building, :old, :new)"
                " WHERE building LIKE :like"
            ), p)
        conn.commit()
