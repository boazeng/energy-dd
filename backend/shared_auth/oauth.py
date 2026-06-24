"""זרימת Google OAuth 2.0 / OpenID Connect."""
import base64
import json
import secrets
from urllib.parse import urlencode

import httpx

_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"


def new_state() -> str:
    """מחרוזת CSRF state אקראית."""
    return secrets.token_urlsafe(24)


def build_login_url(client_id: str, redirect_uri: str, state: str) -> str:
    """כתובת ההפניה ל-Google להתחלת ההתחברות."""
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }
    return f"{_AUTH_ENDPOINT}?{urlencode(params)}"


def _decode_id_token(id_token: str) -> dict:
    """מפענח את ה-payload של ה-JWT.

    אין צורך באימות חתימה: ה-id_token התקבל ישירות מנקודת הקצה של Google
    דרך ערוץ TLS מאומת (זרימת authorization-code), כך שהתוכן מהימן.
    """
    payload = id_token.split(".")[1]
    payload += "=" * (-len(payload) % 4)  # ריפוד base64
    return json.loads(base64.urlsafe_b64decode(payload))


async def exchange_code(client_id: str, client_secret: str,
                        redirect_uri: str, code: str) -> dict:
    """מחליף authorization code בפרטי המשתמש המאומתים מ-Google."""
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(_TOKEN_ENDPOINT, data={
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        })
    resp.raise_for_status()
    claims = _decode_id_token(resp.json()["id_token"])
    if claims.get("aud") != client_id:
        raise ValueError("OAuth: aud לא תואם ל-client_id")
    return {
        "email": (claims.get("email") or "").strip().lower(),
        "email_verified": bool(claims.get("email_verified")),
        "name": claims.get("name", ""),
    }
