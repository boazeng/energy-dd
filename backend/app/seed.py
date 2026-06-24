"""זריעת מטלות בדיקת נאותות ראשוניות — רץ פעם אחת אם הטבלה ריקה."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.task import Task

# מטלות פתיחה לכל אחת מארבע קטגוריות הבדיקה
SEED_TASKS: list[tuple[str, str]] = [
    # הסכמי דיירים
    ("tenant_agreement", "לאסוף את כל הסכמי הדיירים הפעילים"),
    ("tenant_agreement", "לוודא תוקף וחתימות בכל הסכם"),
    ("tenant_agreement", "לבדוק תנאי תשלום עבור הטענת רכב חשמלי"),
    ("tenant_agreement", "לאתר סעיפי סיום/חידוש חוזה"),
    # דוחות כספיים ומאזני בוחן
    ("financial", "לאסוף דוחות כספיים ל-3 השנים האחרונות"),
    ("financial", "לעבור על מאזן בוחן אחרון"),
    ("financial", "לזהות התחייבויות והלוואות פתוחות"),
    # אקסל בעלים
    ("owners", "לאמת את רשימת בעלי החברה ואחוזי החזקה"),
    ("owners", "להצליב פרטי בעלים מול רשם החברות"),
    # כרטסות ספקים
    ("supplier_ledger", "לאסוף כרטסות ספקים מרכזיים"),
    ("supplier_ledger", "לבדוק יתרות פתוחות מול ספקים"),
    ("supplier_ledger", "לזהות התקשרויות/חוזים מהותיים עם ספקים"),
]


def seed_tasks(db: Session) -> int:
    """מוסיף את מטלות הפתיחה רק אם אין מטלות. מחזיר כמה נוספו."""
    exists = db.scalar(select(Task.id).limit(1))
    if exists is not None:
        return 0
    db.add_all(Task(category=c, title=t) for c, t in SEED_TASKS)
    db.commit()
    return len(SEED_TASKS)
