# מערכת בדיקת נאותות — חברת אנרגיה

אתר פנימי לריכוז נתוני בדיקת נאותות (Due Diligence) לקראת רכישת חברה שמנהלת חשמל
בבניינים להטענת רכבים חשמליים. עיצוב TACT, עברית RTL.

**סטאק:** FastAPI + SQLite (backend) · React + Vite (frontend).

## מצב נוכחי

שלד עם שתי לשוניות:
- **בית** — כרטיסי KPI (ספירת מטלות לפי סטטוס) + כרטיסי ארבע קטגוריות הבדיקה.
- **רשימת מטלות** — טבלת מטלות עם סינון לפי קטגוריה, שינוי סטטוס והוספת מטלה.

התוכנית המלאה והשלבים הבאים: ראה `C:\Users\User\.claude\plans\cached-dancing-papert.md`.

## הרצה מקומית

**Backend** (פורט 8035):
```bash
cd backend
.venv/Scripts/python.exe -m uvicorn app.main:app --port 8035 --reload
```

**Frontend** (פורט 5173, מנתב /api ל-backend):
```bash
cd frontend
npm run dev
```

נפתח בדפדפן: http://localhost:5173

## פריסה (Mac mini + Cloudflare Tunnel)

האתר חי ב‑`https://energy-dd.newavera.co.il` (Docker על ה‑Mac, פורט 8100, מאחורי
התחברות Google). **auto-deploy:** כל `git push origin main` מפעיל webhook
(`deploy.newavera.co.il`) שמושך את הקוד ובונה מחדש את הקונטיינר — תוך ~30 שניות,
ללא צעדים ידניים.

## מבנה

```
backend/app/
  core/      config (env משותף) + db (SQLAlchemy/SQLite)
  models/    Task
  schemas/   סכמות Pydantic
  api/       נתיבי /api/tasks
  seed.py    מטלות פתיחה לכל קטגוריה
  main.py    אפליקציית FastAPI + /health
frontend/src/
  components/  TactLogo, TactIcon (עיצוב TACT)
  styles/      tokens.css, recipes.css (TACT) + app.css
  pages/       Home, Tasks
  api/client.js, constants.js, App.jsx
```
