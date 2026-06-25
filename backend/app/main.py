"""נקודת הכניסה של ה-backend — FastAPI."""
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import building_models, cashflow, financials, projects, supplier_balances, supplier_ledger, tasks, tenant_agreements
from app.core.config import settings
from app.core.db import SessionLocal, init_db
from app.seed import seed_tasks
from app.seed_cashflow import seed_cashflow
from app.seed_contracts import seed_contracts
from app.seed_supplier_balances import seed_supplier_balances
from app.seed_building_models import seed_building_models
from app.seed_supplier_ledger import seed_supplier_ledger

logger = logging.getLogger("energy-dd")

# ה-frontend הבנוי (vite build) — קיים רק בפרודקשן (image), מוגש מאותו origin.
STATIC_DIR = Path(__file__).resolve().parents[1] / "static"


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    with SessionLocal() as db:
        seed_tasks(db)
        seed_cashflow(db)
        seed_contracts(db)
        seed_supplier_balances(db)
        seed_supplier_ledger(db)
        seed_building_models(db)
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tasks.router)
app.include_router(tenant_agreements.router)
app.include_router(projects.router)
app.include_router(financials.router)
app.include_router(cashflow.router)
app.include_router(supplier_balances.router)
app.include_router(supplier_ledger.router)
app.include_router(building_models.router)


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.app_name}


# ===================== אימות Google (shared-auth) =====================
# מותקן רק כשהוגדרו אישורי Google ב-env (בפרודקשן דרך .env). בפיתוח מקומי ללא
# האישורים — מדלגים, כדי שהאפליקציה תרוץ בלי התחברות.
if os.getenv("GOOGLE_OAUTH_CLIENT_ID"):
    from shared_auth import install_auth

    # רשימת מורשים נטענת מ-env (לא ב-git): "a@x.com,b@y.com"
    _allowed = os.getenv("AUTH_ALLOWED_EMAILS", "")
    _initial_users = [
        {"email": e.strip(), "role": "user"} for e in _allowed.split(",") if e.strip()
    ]
    install_auth(
        app,
        db_path=settings.auth_db_path,
        redirect_uri=f"{settings.public_base_url}/auth/callback",
        initial_users=_initial_users,
        public_prefixes=("/assets/", "/health", "/favicon"),
    )
    logger.info("אימות Google הופעל (%d מורשים ראשוניים)", len(_initial_users))
else:
    logger.warning("אימות Google כבוי — אין GOOGLE_OAUTH_CLIENT_ID ב-env")


# הגשת ה-SPA הבנוי — חייב להירשם אחרון (תופס את כל שאר הנתיבים).
# בפיתוח התיקייה לא קיימת (Vite מגיש), ואז נדלג.
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
