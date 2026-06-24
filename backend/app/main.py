"""נקודת הכניסה של ה-backend — FastAPI."""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import projects, tasks, tenant_agreements
from app.core.config import settings
from app.core.db import SessionLocal, init_db
from app.seed import seed_tasks

# ה-frontend הבנוי (vite build) — קיים רק בפרודקשן (image), מוגש מאותו origin.
STATIC_DIR = Path(__file__).resolve().parents[1] / "static"


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    with SessionLocal() as db:
        seed_tasks(db)
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


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.app_name}


# הגשת ה-SPA הבנוי — חייב להירשם אחרון (תופס את כל שאר הנתיבים).
# בפיתוח התיקייה לא קיימת (Vite מגיש), ואז נדלג.
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
