"""טעינת הגדרות shared-auth ממשתני סביבה.

האפליקציה המארחת אחראית לטעון את קובץ ה-.env; כאן רק קוראים מ-os.environ.
"""
import os
from dataclasses import dataclass


@dataclass
class AuthConfig:
    client_id: str
    client_secret: str
    session_secret: str
    emergency_token: str
    super_admin_email: str
    disabled: bool

    @classmethod
    def from_env(cls) -> "AuthConfig":
        def required(name: str) -> str:
            value = os.getenv(name, "").strip()
            if not value:
                raise RuntimeError(f"shared-auth: חסר משתנה סביבה חובה: {name}")
            return value

        return cls(
            client_id=required("GOOGLE_OAUTH_CLIENT_ID"),
            client_secret=required("GOOGLE_OAUTH_CLIENT_SECRET"),
            session_secret=required("AUTH_SESSION_SECRET"),
            emergency_token=os.getenv("AUTH_EMERGENCY_TOKEN", "").strip(),
            super_admin_email=os.getenv("AUTH_SUPER_ADMIN_EMAIL", "").strip().lower(),
            disabled=os.getenv("AUTH_DISABLED", "false").strip().lower() in ("1", "true", "yes"),
        )
