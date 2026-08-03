"""Seed building models from the 19 signed contracts — runs once if table is empty.
   sync_projects_data runs on every startup to refresh current_chargers + potential_spots.
"""
import json
import logging
import re
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.building_model import BuildingModel
from app.models.tenant_agreement import TenantAgreement

logger = logging.getLogger("energy-dd")

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
        building_name="בן גוריון 7, אשקלון",
        mgmt_fee=50, elec_rate=30, avg_kwh=150,
        purchase=3800, install=0, potential=77,
    ),
    dict(
        building_name="בן גוריון 9, אשקלון",
        mgmt_fee=50, elec_rate=30, avg_kwh=150,
        purchase=3800, install=0, potential=65,
    ),
    dict(
        building_name="גבע 2, אשקלון",
        mgmt_fee=50, elec_rate=30, avg_kwh=150,
        purchase=3800, install=0, potential=77,
    ),
    dict(
        building_name="אשתאול 1, אשקלון",
        mgmt_fee=50, elec_rate=30, avg_kwh=150,
        purchase=3800, install=0, potential=65,
    ),
    dict(
        building_name="קין קאורין 9, אשקלון",
        mgmt_fee=50, elec_rate=30, avg_kwh=150,
        purchase=3800, install=0,
    ),
    # SLS Sails — מודל חלוקת הכנסות (55% SER); elec_rate=0 — לעדכן ע"פ תעריף גביה בפועל
    dict(
        building_name="סטאר סנטר אשדוד",
        mgmt_fee=0, elec_rate=0, avg_kwh=200,
        purchase=0, install=0,
    ),
    dict(
        building_name="ארנה נהריה",
        mgmt_fee=0, elec_rate=0, avg_kwh=200,
        purchase=0, install=0,
    ),
    dict(
        building_name="ג'ו עמר 4A, אשדוד",
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
        building_name="שדרות היובל 3, ראשון לציון",
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
    """נרמול שם לצורך השוואה: הסרת ספרות, סימנים ורווחים מיותרים.

    שימוש: התאמת building_models מול tenant_agreements — שם הסכם עשוי
    לכסות כמה כתובות (למשל הסכם "היי גרופ" אחד עבור 4 בניינים), ולכן
    התעלמות ממספר הבית פה היא רצויה.
    """
    s = re.sub(r"[0-9]", "", s or "")
    s = re.sub(r"[+\-/,\"׳׳'״]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _normalize_keep_digits(s: str) -> str:
    """נרמול שם לצורך השוואה, משמר מספרים.

    שימוש: התאמת building_models מול projects.json — שם פרויקט תמיד
    מייצג כתובת פיזית אחת, ומספר הבית הוא ההבדל היחיד בין כתובות
    שכנות (למשל "בן גוריון 7" מול "בן גוריון 9"). הסרת הספרות שם היתה
    גורמת לשתי הכתובות להיראות זהות ולהתלכד לאותו פרויקט.
    """
    s = re.sub(r"[+\-/,\"׳׳'״]", " ", s or "")
    return re.sub(r"\s+", " ", s).strip()


def _word_match(norm_a: str, norm_b: str) -> bool:
    """התאמת מילים שלמות בין שני מחרוזות מנורמלות.

    שם מנורמל קצר (כמו "גבע", אחרי הסרת מספר הבית מ"גבע 2") הוא
    substring גנרי מדי — הוא עלול "להימצא" בתוך מילה ארוכה לגמרי לא
    קשורה (למשל "גבעתיים"). לכן במקום בדיקת substring גולמית, מפרקים
    למילים ובודקים שכל מילות הצד הקצר מופיעות כמילים שלמות בצד הארוך.
    """
    tokens_a, tokens_b = set(norm_a.split()), set(norm_b.split())
    if not tokens_a or not tokens_b:
        return False
    return tokens_a <= tokens_b or tokens_b <= tokens_a


def _match_project(building_name: str, projects: list[dict]) -> dict | None:
    """מוצא פרויקט תואם ב-projects.json לפי שם מנורמל.

    building_name בפורמט "רחוב, עיר" (למשל "גבע 2, אשקלון"). אותו שם
    רחוב יכול להופיע בכמה ערים שונות — לכן קודם מנסה התאמה מדויקת של
    רחוב+עיר יחד (הכי בטוחה), אחר כך רחוב בלבד (מונע בלבול בין כתובות
    שכנות כמו "בן גוריון 7" מול "בן גוריון 9"), ורק אם לא נמצאה נופל
    חזרה להתאמת מילים שלמות בלי מספרים — למקרים של כתובות מרוכבות
    בפורמטים שונים (למשל "אייזנברג 1+3").
    """
    parts = building_name.split(",")
    street_part = parts[0].strip()
    city_part = parts[1].strip() if len(parts) > 1 else ""

    exact_street = _normalize_keep_digits(street_part)
    exact_city = _normalize_keep_digits(city_part)

    if exact_street and exact_city:
        for p in projects:
            if (_normalize_keep_digits(p.get("project", "")) == exact_street
                    and _normalize_keep_digits(p.get("city", "")) == exact_city):
                return p

    for p in projects:
        if exact_street and _normalize_keep_digits(p.get("project", "")) == exact_street:
            return p

    norm_street = _normalize(street_part)
    for p in projects:
        # פרויקט: project="אייזנברג 1+3", city="רחובות"
        norm_proj = _normalize(p.get("project", ""))
        if norm_proj and _word_match(norm_proj, norm_street):
            return p

    return None


def _count_no_rcd(chargers: list[dict], proj_name: str) -> int:
    """סופר מטענים ללא פחת (has_rcd falsy) לפרויקט נתון.

    התאמה מדויקת (משמרת מספר בית) קודם, ואז נפילה חזרה להתאמת מילים
    שלמות — אותה סיבה כמו ב-_match_project (למנוע בלבול בין כתובות
    שכנות, ובין שמות קצרים לשמות ארוכים לא קשורים).
    """
    exact = _normalize_keep_digits(proj_name)
    matched = [c for c in chargers if exact and _normalize_keep_digits(c.get("project", "")) == exact]

    if not matched:
        norm = _normalize(proj_name)
        matched = [
            c for c in chargers
            if norm and _word_match(norm, _normalize(c.get("project", "")))
        ]

    return sum(1 for c in matched if not c.get("has_rcd"))


def sync_projects_data(db: Session, projects_path: str) -> int:
    """מעדכן current_chargers, potential_spots ו-chargers_no_rcd מ-projects.json.

    מחפש קודם לפי external_project_key מאושר (exact match, מהיר ובטוח). בניין
    בלי מפתח שמור (חדש, או לפני הפעלת השדה) נופל להתאמה המטושטשת הקיימת
    (_match_project), ואם הצליחה — התוצאה ננעלת ב-external_project_key, כך
    שבריצות הבאות כבר לא תיבדק שוב fuzzy matching לאותו בניין.
    """
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

    by_key = {p.get("project"): p for p in projects if p.get("project")}

    models = list(db.scalars(select(BuildingModel)))
    updated = 0
    for bm in models:
        proj = by_key.get(bm.external_project_key) if bm.external_project_key else None
        if proj is None:
            proj = _match_project(bm.building_name, projects)
            if proj is not None:
                key = proj.get("project", "")
                if key:
                    bm.external_project_key = key
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


def _parse_cost(text: str) -> float:
    """מחלץ מספר מטקסט כגון '₪1,500' או '1500 ש"ח'."""
    nums = re.findall(r"[\d,]+", str(text or ""))
    if not nums:
        return 0.0
    return float(nums[0].replace(",", ""))


def _parse_mgmt_fee(text: str) -> float | None:
    """מחלץ דמי ניהול חודשיים (₪/עמדה) מטקסט כגון '₪40/עמדה/חודש' או '40'."""
    nums = re.findall(r"\d+(?:[.,]\d+)?", str(text or ""))
    if not nums:
        return None
    return float(nums[0].replace(",", "."))


def _parse_elec_rate(text: str) -> float | None:
    """מחלץ תוספת חשמל (אג'/kWh) מטקסט כגון 'חח"י + 30 אג\\'/ kWh'.

    מחזיר 0.0 כשהטקסט מציין חח"י בלבד ללא תוספת, None כשהשדה ריק.
    """
    if not (text or "").strip():
        return None
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*אג", str(text))
    if m:
        return float(m.group(1).replace(",", "."))
    if re.search(r'חח"?י\s*בלבד|ללא\s*תוספת', str(text), re.IGNORECASE):
        return 0.0
    nums = re.findall(r"\d+(?:[.,]\d+)?", str(text))
    if nums:
        return float(nums[0].replace(",", "."))
    return None


def sync_mgmt_fee_and_elec_rate(db: Session) -> int:
    """מסנכרן mgmt_fee_per_charger ו-electricity_rate_agorot מ-tenant_agreements לפי agreement_id."""
    agreements = {a.id: a for a in db.scalars(select(TenantAgreement))}
    models = list(db.scalars(select(BuildingModel)))
    updated = 0
    for bm in models:
        if bm.agreement_id is None or "חסר הסכם" in (bm.notes or ""):
            continue
        agr = agreements.get(bm.agreement_id)
        if agr is None:
            continue
        changed = False
        mgmt_fee = _parse_mgmt_fee(agr.payment)
        if mgmt_fee is not None and bm.mgmt_fee_per_charger != mgmt_fee:
            bm.mgmt_fee_per_charger = mgmt_fee
            changed = True
        elec_rate = _parse_elec_rate(agr.pricing_model)
        if elec_rate is not None and bm.electricity_rate_agorot != elec_rate:
            bm.electricity_rate_agorot = elec_rate
            changed = True
        if changed:
            updated += 1
    if updated:
        db.commit()
    return updated


def _parse_contract_term(term: str) -> tuple[int | None, int | None]:
    """מחלץ (שנת_תחילה, משך_שנים) מטקסט כמו '10 שנים (2×5) — נחתם 16/10/2025' או '20 שנה'."""
    if not term:
        return None, None

    # משך: המספר הראשון לפני "שנה" / "שנים" / "שנות"
    m_dur = re.search(r'(\d+)\s*שנ(?:ה|ים|ות)', term)
    duration = int(m_dur.group(1)) if m_dur else None

    # שנה מתאריך DD/MM/YYYY
    m_year = re.search(r'\d{1,2}/\d{1,2}/(\d{4})', term)
    if m_year:
        return int(m_year.group(1)), duration

    # שנה מ-"כנראה YYYY" או "ינואר YYYY" וכד'
    m_text = re.search(r'(?:כנראה|נחתם\s+\w+)\s+(\d{4})', term)
    if m_text:
        return int(m_text.group(1)), duration

    # כל מספר 4-ספרתי כ-fallback
    m_any = re.search(r'(20\d{2})', term)
    if m_any:
        return int(m_any.group(1)), duration

    return None, duration


def sync_contract_dates(db: Session) -> int:
    """מסנכרן contract_start_year ו-contract_duration_years מ-tenant_agreements.term לפי agreement_id."""
    agreements = {a.id: a for a in db.scalars(select(TenantAgreement))}
    models = list(db.scalars(select(BuildingModel)))
    updated = 0
    for bm in models:
        if bm.agreement_id is None:
            continue
        agr = agreements.get(bm.agreement_id)
        if agr is None:
            continue
        start_year, duration = _parse_contract_term(agr.term)
        changed = False
        if start_year is not None and bm.contract_start_year != start_year:
            bm.contract_start_year = start_year
            changed = True
        if duration is not None and bm.contract_duration_years != duration:
            bm.contract_duration_years = duration
            changed = True
        if changed:
            updated += 1
    if updated:
        db.commit()
    return updated


def sync_install_income(db: Session) -> int:
    """מסנכרן charger_install_income מ-tenant_agreements.charger_cost לפי agreement_id."""
    agreements = {a.id: a for a in db.scalars(select(TenantAgreement))}
    models = list(db.scalars(select(BuildingModel)))
    updated = 0
    for bm in models:
        if bm.agreement_id is None or "חסר הסכם" in (bm.notes or ""):
            continue  # בניינים ללא הסכם — לא מסנכרנים מ-agreements
        agr = agreements.get(bm.agreement_id)
        if agr is None:
            continue
        cost = _parse_cost(agr.charger_cost)
        if bm.charger_install_income != cost:
            bm.charger_install_income = cost
            updated += 1
    if updated:
        db.commit()
    return updated


def backfill_building_links(db: Session) -> int:
    """מילוי חד-פעמי של building_models.agreement_id לפי ההתאמה המטושטשת הקיימת.

    ממלא רק בניינים בלי agreement_id (לעולם לא דורס קישור קיים). לאחר ריצה זו
    sync_mgmt_fee_and_elec_rate/sync_contract_dates/sync_install_income עובדים
    לפי agreement_id בלבד, בלי matching מטושטש בכל הרצה — זה מה שמנע את הבאגים
    החוזרים (למשל גבע 2 / בן גוריון 7-9) שנבעו מהרצת matching בכל ריסטארט.
    """
    agreements = [a for a in db.scalars(select(TenantAgreement)) if a.building]
    agr_norms = [(a, _normalize(a.building.split(",")[0].strip())) for a in agreements]
    models = list(db.scalars(select(BuildingModel)))

    linked = 0
    for bm in models:
        if bm.agreement_id is not None:
            continue
        norm_bm = _normalize(bm.building_name.split(",")[0].strip())
        matches = [
            a for a, norm_agr in agr_norms
            if norm_agr and (norm_agr in norm_bm or norm_bm in norm_agr)
        ]
        if len(matches) == 1:
            bm.agreement_id = matches[0].id
            linked += 1
        elif len(matches) > 1:
            logger.warning(
                "backfill_building_links: '%s' תואם כמה הסכמים (%s) — לא קושר אוטומטית",
                bm.building_name, [a.id for a in matches],
            )
    if linked:
        db.commit()
    return linked


def sync_missing_agreement_buildings(db: Session, projects_path: str) -> int:
    """מוסיף לתזרים בניינים שיש להם פרויקט אך חסר להם הסכם חתום.

    ברירות מחדל: ₪30 ניהול, 30 אג'/kWh, 5 שנות הסכם.
    מסומנים ב-notes='חסר הסכם'.
    """
    path = Path(projects_path)
    if not path.is_file():
        return 0
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return 0

    projects = data.get("buildings", [])
    if not projects:
        return 0

    # נרמול שמות ההסכמים
    from app.models.tenant_agreement import TenantAgreement
    agreements = list(db.scalars(select(TenantAgreement)))
    agr_norms = {_normalize(a.building.split(",")[0].strip()) for a in agreements if a.building}

    # שמות בניינים קיימים ב-building_models (מנורמלים לצורך השוואה)
    existing = list(db.scalars(select(BuildingModel)))
    existing_norms = {_normalize(bm.building_name.split(",")[0].strip()) for bm in existing}

    # עדכן בניינים קיימים "חסר הסכם" שנוספו לפני שהוגדר ברירת מחדל 2000 ₪
    updated = 0
    for bm in existing:
        if "חסר הסכם" in (bm.notes or "") and (bm.charger_install_income or 0) == 0:
            bm.charger_install_income = 2000.0
            updated += 1
    if updated:
        db.commit()

    added = 0
    for p in projects:
        proj_name = (p.get("project") or "").strip()
        city = (p.get("city") or "").strip()
        if not proj_name:
            continue

        proj_norm = _normalize(proj_name)

        # יש הסכם — דלג
        has_agreement = any(n and (n in proj_norm or proj_norm in n) for n in agr_norms)
        if has_agreement:
            continue

        # כבר קיים ב-building_models — דלג
        already_exists = any(n and (n in proj_norm or proj_norm in n) for n in existing_norms)
        if already_exists:
            continue

        building_name = f"{proj_name}, {city}" if city else proj_name
        chargers = int(p.get("chargers_installed") or 0)
        park_total = int(p.get("park_total") or 0)

        db.add(BuildingModel(
            building_name=building_name,
            current_chargers=chargers,
            potential_spots=park_total,
            annual_growth_rate=10.0,
            mgmt_fee_per_charger=30.0,
            electricity_rate_agorot=30.0,
            avg_kwh_per_charger_monthly=150.0,
            subscription_fee_per_charger=0.0,
            cost_charger_unit=800,
            cost_infra_per_charger=1200,
            cost_install_per_charger=1300,
            cost_elec_panel=6000,
            cost_comm_panel=1000,
            chargers_per_panel=10,
            start_year=2026,
            forecast_years=5,
            contract_duration_years=5,
            charger_install_income=2000.0,
            notes="חסר הסכם",
        ))
        existing_norms.add(proj_norm)
        added += 1

    if added:
        db.commit()
    return added


def sync_tenants_data_sites(db: Session) -> int:
    """מסנכרן בניינים ממקור tenants_data.json (מ-contracts_temp, בתוך ה-repo).

    לכל בניין שאין לו הסכם תואם ב-tenant_agreements ואינו קיים ב-building_models —
    מוסיף רשומה עם notes='חסר הסכם' וברירות מחדל.
    מטרה: לוודא שאתרים ציבוריים (כגון ארנה נהריה, סטאר סנטר) מופיעים בתזרים בניינים.
    """
    # בדוקר: /app/app/seed.py → parents[1]=/app/ → /app/contracts_temp/tenants_data.json
    # לוקאלית: .../backend/app/seed.py → parents[2]=energy-dd/ → .../contracts_temp/tenants_data.json
    _base = Path(__file__).resolve().parent
    tenants_path = None
    for candidate_base in [_base.parent, _base.parents[1]]:
        p = candidate_base / "contracts_temp" / "tenants_data.json"
        if p.is_file():
            tenants_path = p
            break
    if tenants_path is None:
        return 0

    try:
        data = json.loads(tenants_path.read_text(encoding="utf-8"))
    except Exception:
        return 0

    rows = data.get("tenants", {}).get("סטטוס בניינים", [])
    if not rows:
        return 0

    agreements = list(db.scalars(select(TenantAgreement)))
    agr_norms = {_normalize(a.building.split(",")[0].strip()) for a in agreements if a.building}

    existing = list(db.scalars(select(BuildingModel)))
    existing_norms = {_normalize(bm.building_name.split(",")[0].strip()) for bm in existing}

    added = 0
    for row in rows:
        if not isinstance(row, list) or len(row) < 6:
            continue

        # זיהוי שורת נתונים: col 1 = מס"ד מספרי, col 2 = שם פרויקט
        row_num = row[1] if len(row) > 1 else None
        try:
            int(str(row_num).strip())
        except (ValueError, TypeError):
            continue

        proj_name = (row[2] or "").strip() if len(row) > 2 else ""
        city = (row[3] or "").strip() if len(row) > 3 else ""
        if not proj_name:
            continue

        proj_norm = _normalize(proj_name)

        # יש הסכם חתום תואם → כבר מטופל ב-BUILDING_SEEDS
        has_agreement = any(n and (n in proj_norm or proj_norm in n) for n in agr_norms)
        if has_agreement:
            continue

        # כבר קיים ב-building_models (ממיגרציה קודמת או sync אחר)
        already_exists = any(n and (n in proj_norm or proj_norm in n) for n in existing_norms)
        if already_exists:
            continue

        # חשב כמות מטענים וחניות
        try:
            chargers = int(str(row[5]).strip()) if len(row) > 5 and row[5] else 0
        except (ValueError, TypeError):
            chargers = 0
        try:
            park_total = int(str(row[11]).strip()) if len(row) > 11 and row[11] else 0
        except (ValueError, TypeError):
            park_total = 0

        building_name = f"{proj_name}, {city}" if city else proj_name

        db.add(BuildingModel(
            building_name=building_name,
            current_chargers=chargers,
            potential_spots=park_total,
            annual_growth_rate=10.0,
            mgmt_fee_per_charger=30.0,
            electricity_rate_agorot=30.0,
            avg_kwh_per_charger_monthly=150.0,
            subscription_fee_per_charger=0.0,
            cost_charger_unit=800,
            cost_infra_per_charger=1200,
            cost_install_per_charger=1300,
            cost_elec_panel=6000,
            cost_comm_panel=1000,
            chargers_per_panel=10,
            start_year=2026,
            forecast_years=5,
            contract_duration_years=5,
            charger_install_income=2000.0,
            notes="חסר הסכם",
        ))
        existing_norms.add(proj_norm)
        added += 1

    if added:
        db.commit()
    return added


# בניינים שנמחקים בכוונה ב-migrate_building_models — אסור לזרוע אותם מחדש,
# אחרת הם ייווצרו וימחקו לסירוגין בכל עליית שרת.
_NEVER_RESEED = {"קין קאורין 9, אשקלון"}


def seed_building_models(db: Session) -> int:
    """זורע בניינים חסרים מ-BUILDING_SEEDS — בדיקה פר-בניין, לא רק כשהטבלה ריקה.

    קודם הפונקציה יצאה מיד אם הייתה ולו שורה אחת בטבלה, ולכן בניין מהזריעה
    שנמחק (ידנית דרך הממשק, או ע"י אחת המחיקות ב-migrate_building_models)
    לא חזר לעולם — כך נעלם "שדרות היובל 3, ראשון לציון" מתזרים בניינים.
    בניין חדש נזרע עם current_chargers=0, ו-sync_projects_data שרץ אחריו
    ב-lifespan ממלא את הערך האמיתי מ-projects.json.
    """
    # השוואה מנורמלת (בלי גרשיים/מקפים/פסיקים) ולא מחרוזת גולמית — שמות כמו
    # ג'ו עמר 4A או צה"ל 5 נשמרים ב-DB עם תווי גרש שונים מאלה שבקוד, והשוואה
    # גולמית הייתה מזריעה כפילות במקום לזהות שהבניין כבר קיים.
    existing = {_normalize_keep_digits(n) for n in db.scalars(select(BuildingModel.building_name))}
    seeded_names = []
    for b in BUILDING_SEEDS:
        name = b["building_name"]
        if _normalize_keep_digits(name) in existing or name in _NEVER_RESEED:
            continue
        seeded_names.append(name)
        db.add(BuildingModel(
            building_name=b["building_name"],
            current_chargers=0,
            potential_spots=b.get("potential", 0),
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
            start_year=2026,
            forecast_years=5,
        ))
    if seeded_names:
        db.commit()
        logger.info("seed_building_models: נזרעו %d בניינים חסרים — %s",
                    len(seeded_names), ", ".join(seeded_names))
    return len(seeded_names)
