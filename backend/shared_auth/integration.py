"""install_auth — מחברת את shared-auth לאפליקציית FastAPI:
נתיבי התחברות, middleware, וניהול משתמשים.
"""
import logging
import time

from fastapi import FastAPI, Request, Depends, HTTPException
from starlette.responses import RedirectResponse, HTMLResponse, JSONResponse

from .config import AuthConfig
from .db import UserDB, ROLES, norm_email
from .sessions import Sessions, COOKIE_NAME, STATE_COOKIE
from . import oauth
from .guards import AuthMiddleware, current_user, require_login, require_role

logger = logging.getLogger("shared-auth")

# הגבלת קצב לכניסת חירום — 5 ניסיונות כושלים ל-IP בחלון של 15 דקות
_emergency_fails: dict[str, list[float]] = {}
_EMERGENCY_WINDOW = 900
_EMERGENCY_MAX = 5


def _emergency_blocked(ip: str) -> bool:
    now = time.time()
    hits = [t for t in _emergency_fails.get(ip, []) if now - t < _EMERGENCY_WINDOW]
    _emergency_fails[ip] = hits
    return len(hits) >= _EMERGENCY_MAX


def _emergency_record_fail(ip: str) -> None:
    _emergency_fails.setdefault(ip, []).append(time.time())


def _cookie_kwargs(sessions: Sessions) -> dict:
    return dict(max_age=sessions.max_age, httponly=True, secure=True, samesite="lax")


def install_auth(app: FastAPI, *, db_path, redirect_uri: str,
                 initial_users: list[dict] | None = None,
                 public_prefixes: tuple = ()) -> dict:
    """מחברת אימות והרשאות לאפליקציה. מחזירה dict עם db/config/העזרים."""
    config = AuthConfig.from_env()
    db = UserDB(db_path)
    sessions = Sessions(config.session_secret)

    # זריעת משתמשים ראשוניים — idempotent, לא דורס שינויים קיימים
    for u in (initial_users or []):
        db.add_if_missing(u["email"], u.get("role", "user"), u.get("name", ""))
    if config.super_admin_email:
        db.add_if_missing(config.super_admin_email, "admin", "super-admin")

    def resolve_user(email: str) -> dict | None:
        """מחזיר {email, role, name} אם המשתמש מורשה ופעיל, אחרת None."""
        email = norm_email(email)
        # שכבת ביטחון 1 — super-admin תמיד admin
        if email and email == config.super_admin_email:
            return {"email": email, "role": "admin", "name": "super-admin"}
        rec = db.get(email)
        if rec and rec["active"]:
            return {"email": rec["email"], "role": rec["role"], "name": rec["name"]}
        return None

    # ===================== נתיבי התחברות =====================

    @app.get("/login", include_in_schema=False)
    async def login():
        state = oauth.new_state()
        url = oauth.build_login_url(config.client_id, redirect_uri, state)
        resp = RedirectResponse(url, status_code=302)
        resp.set_cookie(STATE_COOKIE, sessions.sign({"state": state}),
                        max_age=600, httponly=True, secure=True, samesite="lax")
        return resp

    @app.get("/auth/callback", include_in_schema=False)
    async def auth_callback(request: Request, code: str = "", state: str = ""):
        saved = sessions.verify(request.cookies.get(STATE_COOKIE))
        if not saved or saved.get("state") != state or not code:
            return RedirectResponse("/no-access?reason=state", status_code=302)
        try:
            info = await oauth.exchange_code(config.client_id, config.client_secret,
                                             redirect_uri, code)
        except Exception as exc:  # noqa: BLE001
            logger.error("OAuth callback נכשל: %s", exc)
            return RedirectResponse("/no-access?reason=oauth", status_code=302)
        if not info["email_verified"]:
            return RedirectResponse("/no-access?reason=unverified", status_code=302)
        user = resolve_user(info["email"])
        if not user:
            logger.warning("התחברות נדחתה — לא ברשימת מורשים: %s", info["email"])
            return RedirectResponse("/no-access?reason=notallowed", status_code=302)
        db.touch_login(user["email"])
        resp = RedirectResponse("/", status_code=302)
        resp.set_cookie(COOKIE_NAME, sessions.sign(user), **_cookie_kwargs(sessions))
        resp.delete_cookie(STATE_COOKIE)
        logger.info("התחברות: %s (%s)", user["email"], user["role"])
        return resp

    @app.get("/logout", include_in_schema=False)
    async def logout():
        resp = RedirectResponse("/login", status_code=302)
        resp.delete_cookie(COOKIE_NAME)
        return resp

    @app.get("/emergency-login", include_in_schema=False)
    async def emergency_login(request: Request, token: str = ""):
        """שכבת ביטחון 2 — כניסה ללא Google באמצעות טוקן חירום."""
        ip = request.client.host if request.client else "?"
        if _emergency_blocked(ip):
            return HTMLResponse("<h1>429 — נחסם זמנית</h1>", status_code=429)
        if not config.emergency_token or token != config.emergency_token:
            _emergency_record_fail(ip)
            return HTMLResponse("<h1>403</h1>", status_code=403)
        user = {"email": config.super_admin_email or "emergency",
                "role": "admin", "name": "emergency"}
        resp = RedirectResponse("/", status_code=302)
        resp.set_cookie(COOKIE_NAME, sessions.sign(user), **_cookie_kwargs(sessions))
        logger.warning("כניסת חירום בוצעה מ-%s", ip)
        return resp

    @app.get("/no-access", include_in_schema=False, response_class=HTMLResponse)
    async def no_access(reason: str = ""):
        msg = {
            "notallowed": "האימייל שלך אינו מורשה לגשת למערכת. פנה למנהל.",
            "unverified": "כתובת ה-Gmail אינה מאומתת.",
            "state": "פג תוקף הבקשה. נסה להתחבר שוב.",
            "oauth": "ההתחברות מול Google נכשלה. נסה שוב.",
        }.get(reason, "אין גישה.")
        return HTMLResponse(_NO_ACCESS_HTML.replace("{{MSG}}", msg), status_code=403)

    # ===================== ניהול משתמשים (admin) =====================

    @app.get("/auth/me", include_in_schema=False)
    async def auth_me(request: Request):
        return current_user(request) or {}

    @app.get("/auth/users", include_in_schema=False)
    async def list_users(_admin: dict = Depends(require_role("admin"))):
        return {"users": db.list_all(), "roles": list(ROLES)}

    @app.post("/auth/users", include_in_schema=False)
    async def save_user(request: Request, body: dict,
                        admin: dict = Depends(require_role("admin"))):
        email = norm_email(body.get("email", ""))
        role = body.get("role", "user")
        name = body.get("name", "")
        active = bool(body.get("active", True))
        if not email or "@" not in email:
            raise HTTPException(400, "אימייל לא תקין")
        if role not in ROLES:
            raise HTTPException(400, "תפקיד לא תקין")
        # הגנת נעילה-עצמית
        if email == admin["email"] and (role != "admin" or not active):
            raise HTTPException(400, "אי אפשר לשנות לעצמך תפקיד/סטטוס")
        existing = db.get(email)
        if existing and existing["role"] == "admin" and existing["active"] \
                and (role != "admin" or not active) and db.count_active_admins() <= 1:
            raise HTTPException(400, "חייב להישאר admin פעיל אחד לפחות")
        db.upsert(email, role, name, active)
        return {"ok": True}

    @app.post("/auth/users/delete", include_in_schema=False)
    async def delete_user(body: dict, admin: dict = Depends(require_role("admin"))):
        email = norm_email(body.get("email", ""))
        if email == admin["email"]:
            raise HTTPException(400, "אי אפשר למחוק את עצמך")
        if email == config.super_admin_email:
            raise HTTPException(400, "אי אפשר למחוק את ה-super-admin")
        existing = db.get(email)
        if existing and existing["role"] == "admin" and existing["active"] \
                and db.count_active_admins() <= 1:
            raise HTTPException(400, "חייב להישאר admin פעיל אחד לפחות")
        db.delete(email)
        return {"ok": True}

    # ===================== middleware =====================
    app.add_middleware(AuthMiddleware, sessions=sessions, config=config,
                       public_prefixes=public_prefixes)

    logger.info("shared-auth הותקן — %d משתמשים בטבלה", len(db.list_all()))
    return {"db": db, "config": config, "sessions": sessions,
            "current_user": current_user, "require_login": require_login,
            "require_role": require_role}


_NO_ACCESS_HTML = """<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>אין גישה</title>
  <style>
    body { font-family: Heebo, Arial, sans-serif; background: #f0f4f8;
           display: flex; align-items: center; justify-content: center;
           height: 100vh; margin: 0; }
    .card { background: #fff; padding: 40px 48px; border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,.08); text-align: center; }
    h1 { color: #dc2626; margin: 0 0 12px; }
    p { color: #4a5f78; }
    a { display: inline-block; margin-top: 16px; padding: 10px 22px;
        background: #2563eb; color: #fff; text-decoration: none; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>אין גישה</h1>
    <p>{{MSG}}</p>
    <a href="/login">חזרה להתחברות</a>
  </div>
</body>
</html>"""
