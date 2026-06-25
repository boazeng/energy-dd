"""Seed building models from the 19 signed contracts — runs once if table is empty."""
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


def seed_building_models(db: Session) -> int:
    if db.scalar(select(BuildingModel.id).limit(1)) is not None:
        return 0
    for b in BUILDING_SEEDS:
        db.add(BuildingModel(
            building_name=b["building_name"],
            current_chargers=1,       # לעדכון ידני — מטען אחד כנקודת התחלה
            potential_spots=50,        # לעדכון ידני — ברירת מחדל לדיור
            annual_growth_rate=10.0,   # 10% מהפוטנציאל לשנה (ברירת מחדל)
            mgmt_fee_per_charger=b["mgmt_fee"],
            electricity_rate_agorot=b["elec_rate"],
            avg_kwh_per_charger_monthly=b["avg_kwh"],
            subscription_fee_per_charger=0,
            charger_purchase_cost=b["purchase"],
            charger_install_cost=b["install"],
            start_year=2025,
            forecast_years=5,
        ))
    db.commit()
    return len(BUILDING_SEEDS)
