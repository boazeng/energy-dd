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
        # OPEX שנתי חוזר — תחזוקה לכל מטען בכל שנה
        ("cost_maintenance_per_charger", "REAL", 500),
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
        # מחק בניינים שסומנו "חסר הסכם" — נוספו אוטומטית ואינם רלוונטיים לתזרים
        conn.execute(text("DELETE FROM building_models WHERE notes LIKE '%חסר הסכם%'"))

        # פיצול הסכם מרוכז ל-4 בניינים נפרדים
        _COMBINED = "בן גוריון 7 + גבע 2 + אשתאול 1 + קין קאורין 9, אשקלון"
        _SUBS = [
            "בן גוריון 7, אשקלון",
            "גבע 2, אשקלון",
            "אשתאול 1, אשקלון",
            "קין קאורין 9, אשקלון",
        ]
        row = conn.execute(
            text("SELECT * FROM building_models WHERE building_name = :n"),
            {"n": _COMBINED},
        ).mappings().fetchone()
        if row:
            for sub in _SUBS:
                already = conn.execute(
                    text("SELECT id FROM building_models WHERE building_name = :n"), {"n": sub}
                ).fetchone()
                if not already:
                    conn.execute(text("""
                        INSERT INTO building_models (
                            building_name, current_chargers, potential_spots,
                            annual_growth_rate, mgmt_fee_per_charger, electricity_rate_agorot,
                            avg_kwh_per_charger_monthly, subscription_fee_per_charger,
                            cost_charger_unit, cost_infra_per_charger, cost_install_per_charger,
                            cost_elec_panel, cost_comm_panel, chargers_per_panel,
                            chargers_no_rcd, cost_rcd_per_charger, cost_internet_per_charger,
                            cost_inspector_per_charger, charger_install_income, extra_costs,
                            start_year, forecast_years, contract_start_year, contract_duration_years,
                            notes, created_at, updated_at
                        ) VALUES (
                            :name, 0, 0,
                            :agr, :mgmt, :elec,
                            :kwh, :sub_fee,
                            :cu, :infra, :inst,
                            :ep, :cp, :cpp,
                            0, :rcd, :inet, :insp,
                            :cii, :ec,
                            :sy, :fy, :csy, :cdy, '',
                            strftime('%Y-%m-%d %H:%M:%S', 'now'),
                            strftime('%Y-%m-%d %H:%M:%S', 'now')
                        )
                    """), {
                        "name": sub,
                        "agr":     row["annual_growth_rate"],
                        "mgmt":    row["mgmt_fee_per_charger"],
                        "elec":    row["electricity_rate_agorot"],
                        "kwh":     row["avg_kwh_per_charger_monthly"],
                        "sub_fee": row["subscription_fee_per_charger"],
                        "cu":      row["cost_charger_unit"],
                        "infra":   row["cost_infra_per_charger"],
                        "inst":    row["cost_install_per_charger"],
                        "ep":      row["cost_elec_panel"],
                        "cp":      row["cost_comm_panel"],
                        "cpp":     row["chargers_per_panel"],
                        "rcd":     row["cost_rcd_per_charger"],
                        "inet":    row["cost_internet_per_charger"],
                        "insp":    row["cost_inspector_per_charger"],
                        "cii":     row["charger_install_income"],
                        "ec":      row["extra_costs"] or "[]",
                        "sy":      row["start_year"],
                        "fy":      row["forecast_years"],
                        "csy":     row["contract_start_year"],
                        "cdy":     row["contract_duration_years"],
                    })
            conn.execute(
                text("DELETE FROM building_models WHERE building_name = :n"),
                {"n": _COMBINED},
            )

        # הוסף "בן גוריון 9, אשקלון" אם חסר — חלק מאותו הסכם כמו בן גוריון 7
        _BG9 = "בן גוריון 9, אשקלון"
        _BG7 = "בן גוריון 7, אשקלון"
        if not conn.execute(
            text("SELECT id FROM building_models WHERE building_name = :n"), {"n": _BG9}
        ).fetchone():
            src = conn.execute(
                text("SELECT * FROM building_models WHERE building_name = :n"), {"n": _BG7}
            ).mappings().fetchone()
            if src:
                conn.execute(text("""
                    INSERT INTO building_models (
                        building_name, current_chargers, potential_spots,
                        annual_growth_rate, mgmt_fee_per_charger, electricity_rate_agorot,
                        avg_kwh_per_charger_monthly, subscription_fee_per_charger,
                        cost_charger_unit, cost_infra_per_charger, cost_install_per_charger,
                        cost_elec_panel, cost_comm_panel, chargers_per_panel,
                        chargers_no_rcd, cost_rcd_per_charger, cost_internet_per_charger,
                        cost_inspector_per_charger, charger_install_income, extra_costs,
                        start_year, forecast_years, contract_start_year, contract_duration_years,
                        notes, created_at, updated_at
                    ) VALUES (
                        :name, 0, 0,
                        :agr, :mgmt, :elec,
                        :kwh, :sub_fee,
                        :cu, :infra, :inst,
                        :ep, :cp, :cpp,
                        0, :rcd, :inet, :insp,
                        :cii, :ec,
                        :sy, :fy, :csy, :cdy, '',
                        strftime('%Y-%m-%d %H:%M:%S', 'now'),
                        strftime('%Y-%m-%d %H:%M:%S', 'now')
                    )
                """), {
                    "name": _BG9,
                    "agr":     src["annual_growth_rate"],
                    "mgmt":    src["mgmt_fee_per_charger"],
                    "elec":    src["electricity_rate_agorot"],
                    "kwh":     src["avg_kwh_per_charger_monthly"],
                    "sub_fee": src["subscription_fee_per_charger"],
                    "cu":      src["cost_charger_unit"],
                    "infra":   src["cost_infra_per_charger"],
                    "inst":    src["cost_install_per_charger"],
                    "ep":      src["cost_elec_panel"],
                    "cp":      src["cost_comm_panel"],
                    "cpp":     src["chargers_per_panel"],
                    "rcd":     src["cost_rcd_per_charger"],
                    "inet":    src["cost_internet_per_charger"],
                    "insp":    src["cost_inspector_per_charger"],
                    "cii":     src["charger_install_income"],
                    "ec":      src["extra_costs"] or "[]",
                    "sy":      src["start_year"],
                    "fy":      src["forecast_years"],
                    "csy":     src["contract_start_year"],
                    "cdy":     src["contract_duration_years"],
                })

        # עדכן current_chargers לבניינים שנוצרו מהפיצול ונשארו עם 0 (מ-tenants_data.json)
        for _bname, _cur in [
            ("בן גוריון 7, אשקלון",  13),
            ("בן גוריון 9, אשקלון",   1),
            ("גבע 2, אשקלון",        26),
        ]:
            conn.execute(
                text("UPDATE building_models SET current_chargers = :c WHERE building_name = :n AND current_chargers = 0"),
                {"c": _cur, "n": _bname},
            )

        # עדכן potential_spots לבניינים אשקלון (מ-tenants_data.json — כמות דיירים)
        for _bname, _spots in [
            ("בן גוריון 7, אשקלון",  77),
            ("בן גוריון 9, אשקלון",  65),
            ("אשתאול 1, אשקלון",     65),
            ("גבע 2, אשקלון",        77),
        ]:
            conn.execute(
                text("UPDATE building_models SET potential_spots = :s WHERE building_name = :n"),
                {"s": _spots, "n": _bname},
            )

        # הוסף בניינים SLS Sails אם חסרים — מודל חלוקת הכנסות (55% SER)
        for _sls_name in ("סטאר סנטר אשדוד", "ארנה נהריה"):
            if not conn.execute(
                text("SELECT id FROM building_models WHERE building_name = :n"), {"n": _sls_name}
            ).fetchone():
                conn.execute(text("""
                    INSERT INTO building_models (
                        building_name, current_chargers, potential_spots,
                        annual_growth_rate, mgmt_fee_per_charger, electricity_rate_agorot,
                        avg_kwh_per_charger_monthly, subscription_fee_per_charger,
                        cost_charger_unit, cost_infra_per_charger, cost_install_per_charger,
                        cost_elec_panel, cost_comm_panel, chargers_per_panel,
                        chargers_no_rcd, cost_rcd_per_charger, cost_internet_per_charger,
                        cost_inspector_per_charger, charger_install_income, extra_costs,
                        start_year, forecast_years, contract_start_year, contract_duration_years,
                        notes, created_at, updated_at
                    ) VALUES (
                        :name, 0, 0,
                        10, 0, 0,
                        200, 0,
                        800, 1200, 1300,
                        6000, 1000, 10,
                        0, 300, 400, 250,
                        0, '[]',
                        2026, 5, 2022, 10,
                        '',
                        strftime('%Y-%m-%d %H:%M:%S', 'now'),
                        strftime('%Y-%m-%d %H:%M:%S', 'now')
                    )
                """), {"name": _sls_name})

        conn.commit()
