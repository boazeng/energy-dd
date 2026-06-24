# ---- שלב 1: בניית ה-frontend (Vite) ----
FROM node:20-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- שלב 2: backend (FastAPI) + הגשת ה-frontend הבנוי ----
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt tzdata

COPY backend/app ./app
COPY backend/shared_auth ./shared_auth
COPY --from=frontend /frontend/dist ./static
RUN mkdir -p /app/database

EXPOSE 8000
# worker יחיד — SQLite + seed אידמפוטנטי רק תחת תהליך אחד (ראה seed.py)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
