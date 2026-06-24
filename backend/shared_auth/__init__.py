"""shared-auth — אימות Google Sign-In והרשאות מבוססות-תפקידים לאפליקציות FastAPI.

שימוש בסיסי באפליקציה מארחת::

    from shared_auth import install_auth, require_role

    auth = install_auth(
        app,
        db_path="database/auth.db",
        redirect_uri="https://bookkeeping.newavera.co.il/auth/callback",
        initial_users=[{"email": "boazen@gmail.com", "role": "admin"}],
    )

    @app.get("/admin", dependencies=[Depends(require_role("admin"))])
    ...
"""
from .integration import install_auth
from .guards import current_user, require_login, require_role
from .db import UserDB, ROLES

__all__ = ["install_auth", "current_user", "require_login", "require_role", "UserDB", "ROLES"]
__version__ = "0.1.0"
