"""ניהול session — עוגייה חתומה קריפטוגרפית (itsdangerous)."""
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

COOKIE_NAME = "bz_auth"          # עוגיית ה-session של המשתמש המחובר
STATE_COOKIE = "bz_oauth_state"  # עוגייה זמנית ל-CSRF state בזרימת OAuth
DEFAULT_MAX_AGE = 12 * 60 * 60   # תוקף session — 12 שעות


class Sessions:
    """חתימה ואימות של נתוני session בעוגייה."""

    def __init__(self, secret: str, max_age: int = DEFAULT_MAX_AGE) -> None:
        self._serializer = URLSafeTimedSerializer(secret, salt="shared-auth-session")
        self.max_age = max_age

    def sign(self, data: dict) -> str:
        """מחזיר מחרוזת חתומה מתוך dict."""
        return self._serializer.dumps(data)

    def verify(self, token: str | None) -> dict | None:
        """מאמת מחרוזת חתומה ומחזיר את ה-dict, או None אם פגה/לא תקינה."""
        if not token:
            return None
        try:
            return self._serializer.loads(token, max_age=self.max_age)
        except (BadSignature, SignatureExpired):
            return None
