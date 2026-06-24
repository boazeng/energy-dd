"""Middleware ושומרי נתיבים — אכיפת אימות והרשאות."""
import logging

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import RedirectResponse, JSONResponse

from .sessions import COOKIE_NAME

logger = logging.getLogger("shared-auth")

# קידומות נתיב שאינן דורשות אימות
_PUBLIC_PREFIXES = (
    "/login", "/auth/", "/logout", "/emergency-login", "/no-access",
    "/static/", "/favicon",
)


class AuthMiddleware(BaseHTTPMiddleware):
    """בכל בקשה: מזהה את המשתמש מה-session, וחוסם נתיבים לא-מאומתים."""

    def __init__(self, app, sessions, config, public_prefixes=()) -> None:
        super().__init__(app)
        self.sessions = sessions
        self.config = config
        self.public = _PUBLIC_PREFIXES + tuple(public_prefixes)

    async def dispatch(self, request: Request, call_next):
        # אימות מבוטל (דגל חירום) — כולם נחשבים admin
        if self.config.disabled:
            request.state.user = {"email": "auth-disabled", "role": "admin", "name": ""}
            return await call_next(request)

        user = self.sessions.verify(request.cookies.get(COOKIE_NAME))
        request.state.user = user  # dict כשמחובר, אחרת None

        path = request.url.path
        if user or any(path.startswith(p) for p in self.public):
            return await call_next(request)

        # לא מאומת — API מקבל 401, דפים מופנים להתחברות
        if path.startswith("/api/"):
            return JSONResponse({"detail": "לא מחובר"}, status_code=401)
        return RedirectResponse("/login", status_code=302)


def current_user(request: Request) -> dict | None:
    """המשתמש המחובר הנוכחי (dict עם email/role/name), או None."""
    return getattr(request.state, "user", None)


def require_login(request: Request) -> dict:
    """תלות FastAPI — דורשת משתמש מחובר."""
    user = current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="לא מחובר")
    return user


def require_role(*roles: str):
    """תלות FastAPI — דורשת תפקיד מסוים. admin תמיד עובר."""
    def _dependency(request: Request) -> dict:
        user = require_login(request)
        if user["role"] != "admin" and user["role"] not in roles:
            raise HTTPException(status_code=403, detail="אין לך הרשאה")
        return user
    return _dependency
