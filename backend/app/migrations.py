"""מיגרציות ידניות לטבלאות קיימות (SQLite ללא Alembic)."""
from sqlalchemy import Engine, text


def migrate_building_models(engine: Engine) -> None:
    """הוסף עמודות CAPEX מפורטות ל-building_models אם חסרות."""
    new_cols = [
        ("cost_charger_unit",       "REAL",    800),
        ("cost_infra_per_charger",  "REAL",   1200),
        ("cost_install_per_charger","REAL",   1300),
        ("cost_elec_panel",         "REAL",   6000),
        ("cost_comm_panel",         "REAL",   1000),
        ("chargers_per_panel",      "INTEGER",  10),
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
        conn.commit()
