"""בדיקת הכנסות — קריאת אקסלים מ-SharePoint והצגת הנתונים."""
from __future__ import annotations

import io
from typing import Any

import openpyxl
from fastapi import APIRouter, HTTPException

from app.integrations.sharepoint import SharePointError, fetch_file, list_folder

router = APIRouter(prefix="/api/revenue-check", tags=["revenue-check"])

FOLDER_PATH = "כספים/תכנית עסקית/אקסל תוכנית עיסקית/ש.א.ר מוביליטי בעמ/DD/בדיקת הכנסות"


def _parse_excel(content: bytes) -> list[dict]:
    """מחזיר רשימת גיליונות, כל אחד עם שם ורשימת שורות."""
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    sheets = []
    for name in wb.sheetnames:
        ws = wb[name]
        rows: list[list[Any]] = []
        for row in ws.iter_rows(values_only=True):
            if any(cell is not None for cell in row):
                rows.append(
                    [str(cell) if cell is not None else None for cell in row]
                )
        sheets.append({"sheet": name, "rows": rows})
    return sheets


@router.get("/files")
def list_files():
    """רשימת קבצים בתיקיית בדיקת הכנסות ב-SharePoint."""
    try:
        files = list_folder(FOLDER_PATH)
    except SharePointError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"folder": FOLDER_PATH, "files": files}


@router.get("/data")
def get_excel_data():
    """מוריד ומפרסר את כל קבצי האקסל מהתיקייה."""
    try:
        files = list_folder(FOLDER_PATH)
    except SharePointError as e:
        raise HTTPException(status_code=502, detail=str(e))

    excel_files = [
        f for f in files
        if not f["is_folder"] and f["name"].lower().endswith((".xlsx", ".xls"))
    ]

    if not excel_files:
        return {"files": [], "message": "לא נמצאו קבצי אקסל בתיקייה"}

    result = []
    for f in excel_files:
        try:
            content = fetch_file(f["download_url"])
            sheets = _parse_excel(content)
            result.append({
                "name": f["name"],
                "web_url": f["web_url"],
                "sheets": sheets,
                "error": None,
            })
        except Exception as e:
            result.append({
                "name": f["name"],
                "web_url": f.get("web_url", ""),
                "sheets": [],
                "error": str(e),
            })

    return {"files": result}
