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
        for col_name, col_type, default in new_cols:
            if col_name not in existing:
                conn.execute(text(
                    f"ALTER TABLE building_models ADD COLUMN {col_name} {col_type} DEFAULT {default}"
                ))
        # עמודת עלויות נוספות (JSON)
        if "extra_costs" not in existing:
            conn.execute(text("ALTER TABLE building_models ADD COLUMN extra_costs TEXT DEFAULT '[]'"))
        # עדכן start_year ל-2026 בכל הרשומות הקיימות (שנת התחלה = מצב נוכחי)
        conn.execute(text("UPDATE building_models SET start_year = 2026 WHERE start_year = 2025"))
        conn.commit()
