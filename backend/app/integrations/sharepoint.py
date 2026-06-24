"""גישה ל-SharePoint דרך Microsoft Graph (client-credentials).

קוראים קבצים לפי דרישה ושומרים רק קישור — בלי עותק מקומי קבוע.
האישורים נטענים מה-env המשותף דרך app.core.config.settings.
"""
from __future__ import annotations

from urllib.parse import quote, urlparse

import requests

from app.core.config import settings

GRAPH = "https://graph.microsoft.com/v1.0"
_TIMEOUT = 60


class SharePointError(RuntimeError):
    pass


def _token() -> str:
    """Access token דרך client-credentials flow."""
    if not (settings.sharepoint_tenant_id and settings.sharepoint_client_id):
        raise SharePointError("חסרים אישורי SharePoint ב-env")
    url = (
        f"https://login.microsoftonline.com/"
        f"{settings.sharepoint_tenant_id}/oauth2/v2.0/token"
    )
    resp = requests.post(
        url,
        data={
            "client_id": settings.sharepoint_client_id,
            "client_secret": settings.sharepoint_client_secret,
            "scope": "https://graph.microsoft.com/.default",
            "grant_type": "client_credentials",
        },
        timeout=_TIMEOUT,
    )
    if not resp.ok:
        raise SharePointError(f"כשל אימות Graph: {resp.status_code} {resp.text[:300]}")
    return resp.json()["access_token"]


def _headers() -> dict:
    return {"Authorization": f"Bearer {_token()}"}


def _site_id(headers: dict) -> str:
    """מזהה ה-site לפי hostname + נתיב (מתוך SHAREPOINT_SITE_URL + site_path)."""
    host = urlparse(settings.sharepoint_site_url).netloc
    # האתר הוא path-based: yaelisrael.sharepoint.com/Urbanenergy
    path = "Urbanenergy"
    resp = requests.get(f"{GRAPH}/sites/{host}:/{path}", headers=headers, timeout=_TIMEOUT)
    if not resp.ok:
        raise SharePointError(f"כשל באיתור site: {resp.status_code} {resp.text[:300]}")
    return resp.json()["id"]


def list_folder(folder_path: str) -> list[dict]:
    """רשימת קבצים בתיקייה (נתיב יחסי לשורש ספריית המסמכים, ללא 'Shared Documents').

    מחזיר רשימת dict עם: name, web_url, download_url, size, is_folder.
    """
    headers = _headers()
    site = _site_id(headers)
    # ספריית המסמכים הראשית = drive ברירת המחחל של ה-site
    enc = quote(folder_path.strip("/"), safe="/")
    endpoint = f"{GRAPH}/sites/{site}/drive/root:/{enc}:/children"
    resp = requests.get(endpoint, headers=headers, timeout=_TIMEOUT)
    if not resp.ok:
        raise SharePointError(
            f"כשל ברשימת תיקייה '{folder_path}': {resp.status_code} {resp.text[:300]}"
        )
    items = []
    for it in resp.json().get("value", []):
        items.append(
            {
                "name": it.get("name", ""),
                "web_url": it.get("webUrl", ""),
                "download_url": it.get("@microsoft.graph.downloadUrl", ""),
                "size": it.get("size", 0),
                "is_folder": "folder" in it,
            }
        )
    return items


def fetch_file(download_url: str) -> bytes:
    """מוריד תוכן קובץ (טרנזיינטי) לפי downloadUrl שהתקבל מ-list_folder."""
    resp = requests.get(download_url, timeout=_TIMEOUT)
    if not resp.ok:
        raise SharePointError(f"כשל בהורדת קובץ: {resp.status_code}")
    return resp.content
