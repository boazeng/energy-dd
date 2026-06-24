"""נקודת הכניסה של ה-backend — FastAPI."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import tasks, tenant_agreements
from app.core.config import settings
from app.core.db import SessionLocal, init_db
from app.seed import seed_tasks


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


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.app_name}
