"""Seed building models from the 19 signed contracts — runs once if table is empty.
   sync_projects_data runs on every startup to refresh current_chargers + potential_spots.
"""
import json
import re
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.building_model import BuildingModel

# נתונים מחולצים מחוזי הבניינים:
# mgmt_fee  = דמי ניהול חודשיים לעמדה (₪) — נלקח מהמסלול הנמוך / רכב חשמלי
# elec_rate = תוספת חשמל (אג'/kWh); 0 = חח"י בלבד ללא תוספת
# avg_kwh   = צריכה ממוצעת/מינימום חודשי (kWh); 150 כשלא צוין מינימום
# purchase  = עלות עמדה ע"ח היזם (₪); 0 = ע"ח ש.א.ר ללא עלות ישירה לנו
# install   = עלות התקנה ממוצעת (₪)
BUILDING_SEEDS = [
    dict(
        building_name="אייזנברג 1+3, רחובות",
        mgmt_fee=40, elec_rate=30, avg_kwh=150,
        purchase=2000, install=2000,
    ),
    dict(
        building_name="אלקבץ 9-13, ראשון לציון",
        mgmt_fee=35, elec_rate=35, avg_kwh=150,
        purchase=3000, install=1100,
    ),
    dict(
        building_name="הבוסתן 5+7, אשקלון",
        mgmt_fee=50, elec_rate=35, avg_kwh=200,
        purchase=4200, install=1100,
    ),
    dict(
        building_name="בלפור 7, אשדוד",
        mgmt_fee=10, elec_rate=0, avg_kwh=150,
        purchase=4400, install=0,
    ),
    dict(
        building_name="בן גוריון 7 + גבע 2 + אשתאול 1 + קין קאורין 9, אשקלון",
        mgmt_fee=50, elec_rate=30, avg_kwh=150,
        purchase=3800, install=0,
    ),
    dict(
        building_name="גן עמר 4A, אשדוד",
        mgmt_fee=20, elec_rate=35, avg_kwh=150,
        purchase=0, install=750,
    ),
    dict(
        building_name="דודו דותן 3, ראשון לציון",
        mgmt_fee=50, elec_rate=35, avg_kwh=200,
        purchase=2500, install=2000,
    ),
    dict(
        building_name="הרצוג 17, ראש העין",
        mgmt_fee=50, elec_rate=40, avg_kwh=200,
        purchase=2500, install=2750,
    ),
    dict(
        building_name="הרצל 46+48, אשדוד",
        mgmt_fee=40, elec_rate=40, avg_kwh=200,
        purchase=2500, install=2750,
    ),
    dict(
        building_name="יהודה הלוי 21-23, יבנה",
        mgmt_fee=79.9, elec_rate=0, avg_kwh=150,
        purchase=4400, install=3400,
    ),
    dict(
        building_name="כינור 4, אשדוד",
        mgmt_fee=50, elec_rate=40, avg_kwh=200,
        purchase=2500, install=3250,
    ),
    dict(
        building_name="נחשול 10, ראש העין",
        mgmt_fee=50, elec_rate=40, avg_kwh=200,
        purchase=4400, install=3250,
    ),
    dict(
        building_name="נחשול 12, ראש העין",
        mgmt_fee=30, elec_rate=35, avg_kwh=200,
        purchase=3800, install=750,
    ),
    dict(
        building_name="נחשול 14, ראש העין",
        mgmt_fee=45, elec_rate=35, avg_kwh=200,
        purchase=3800, install=2750,
    ),
    dict(
        building_name='צה"ל 5, אשדוד',
        mgmt_fee=20, elec_rate=30, avg_kwh=200,
        purchase=1600, install=1550,
    ),
    dict(
        building_name="שאולי 17-19, אשדוד",
        mgmt_fee=30, elec_rate=35, avg_kwh=200,
        purchase=1600, install=2350,
    ),
    dict(
        building_name="שד׳ היובל 3, ראשון לציון",
        mgmt_fee=80, elec_rate=0, avg_kwh=150,
        purchase=4200, install=2800,
    ),
    dict(
        building_name="שולמית אלוני 3-5, ראשון לציון",
        mgmt_fee=25, elec_rate=30, avg_kwh=200,
        purchase=0, install=1650,
    ),
    dict(
        building_name="תפוז 13, אשדוד",
        mgmt_fee=25, elec_rate=35, avg_kwh=200,
        purchase=4400, install=1550,
    ),
]


def _normalize(s: str) -> str:
    """נרמול שם לצורך השוואה: הסרת ספרות, סימנים ורווחים מיותרים."""
    s = re.sub(r"[0-9]", "", s or "")
    s = re.sub(r"[+\-/,\"׳׳'״]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _match_project(building_name: str, projects: list[dict]) -> dict | None:
    """מוצא פרויקט תואם ב-projects.json לפי שם מנורמל."""
    # שם הבניין: "אייזנברג 1+3, רחובות"  →  street_part = "אייזנברג 1+3"
    street_part = building_name.split(",")[0].strip()
    norm_street = _normalize(street_part)

    for p in projects:
        # פרויקט: project="אייזנברג 1+3", city="רחובות"
        norm_proj = _normalize(p.get("project", ""))
        # התאמה: שם הרחוב המנורמל מופיע בשם הפרויקט המנורמל (או להפך)
        if norm_proj and (norm_proj in norm_street or norm_street in norm_proj):
            return p

    return None


def _count_no_rcd(chargers: list[dict], proj_name: str) -> int:
    """סופר מטענים ללא פחת (has_rcd falsy) לפרויקט נתון."""
    norm = _normalize(proj_name)
    count = 0
    for c in chargers:
        if _normalize(c.get("project", "")) == norm or norm in _normalize(c.get("project", "")):
            if not c.get("has_rcd"):
                count += 1
    return count


def sync_projects_data(db: Session, projects_path: str) -> int:
    """מעדכן current_chargers, potential_spots ו-chargers_no_rcd מ-projects.json."""
    path = Path(projects_path)
    if not path.is_file():
        return 0

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return 0

    projects = data.get("buildings", [])
    all_chargers = data.get("chargers", [])
    if not projects:
        return 0

    models = list(db.scalars(select(BuildingModel)))
    updated = 0
    for bm in models:
        proj = _match_project(bm.building_name, projects)
        if proj is None:
            continue
        chargers_installed = proj.get("chargers_installed") or 0
        park_total = proj.get("park_total") or 0
        no_rcd = _count_no_rcd(all_chargers, proj.get("project", ""))
        bm.current_chargers = int(chargers_installed) if chargers_installed else bm.current_chargers
        bm.potential_spots = int(park_total) if park_total else bm.potential_spots
        bm.chargers_no_rcd = no_rcd
        updated += 1

    if updated:
        db.commit()
    return updated


def seed_building_models(db: Session) -> int:
    if db.scalar(select(BuildingModel.id).limit(1)) is not None:
        return 0
    for b in BUILDING_SEEDS:
        db.add(BuildingModel(
            building_name=b["building_name"],
            current_chargers=0,
            potential_spots=0,
            annual_growth_rate=10.0,
            mgmt_fee_per_charger=b["mgmt_fee"],
            electricity_rate_agorot=b["elec_rate"],
            avg_kwh_per_charger_monthly=b["avg_kwh"],
            subscription_fee_per_charger=0,
            # CAPEX — ברירות מחדל אחידות לכל הבניינים (ניתנות לשינוי בממשק)
            cost_charger_unit=800,
            cost_infra_per_charger=1200,
            cost_install_per_charger=1300,
            cost_elec_panel=6000,
            cost_comm_panel=1000,
            chargers_per_panel=10,
            start_year=2025,
            forecast_years=5,
        ))
    db.commit()
    return len(BUILDING_SEEDS)
