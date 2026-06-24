"""הגדרות המערכת — נטענות מה-env המשותף של כל הפרויקטים."""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# ה-env המשותף לכל הפרויקטים (ראה זיכרון: extra=ignore חובה)
SHARED_ENV = Path(r"C:\Users\User\Aiprojects\env\.env")
PROJECT_ROOT = Path(__file__).resolve().parents[2]  # .../enery-dd/backend


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(SHARED_ENV) if SHARED_ENV.exists() else None,
        extra="ignore",  # ה-env המשותף מכיל מפתחות של פרויקטים אחרים
    )

    app_name: str = "מערכת בדיקת נאותות — אנרגיה"
    database_url: str = f"sqlite:///{PROJECT_ROOT / 'enery_dd.db'}"

    # נתוני הפרויקטים (מקובץ האקסל של החברה) — JSON שיושב על ה-volume בשרת,
    # לא ב-git (מכיל שמות לקוחות). בפרודקשן: /app/database/projects.json
    projects_data_path: str = str(PROJECT_ROOT / "database" / "projects.json")

    # ניתוח כספי (מתוך הדוחות המבוקרים ומאזני הבוחן) — JSON על ה-volume, לא ב-git.
    financials_data_path: str = str(PROJECT_ROOT / "database" / "financials.json")

    # CORS — שרת הפיתוח של Vite
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # מפתח Claude לחילוץ AI (שלב מאוחר יותר) — נטען מה-env המשותף
    anthropic_api_key: str = ""

    # SharePoint / Microsoft Graph (client-credentials) — נטען מה-env המשותף
    sharepoint_tenant_id: str = ""
    sharepoint_client_id: str = ""
    sharepoint_client_secret: str = ""
    sharepoint_site_url: str = ""  # לדוגמה https://yaelisrael.sharepoint.com


settings = Settings()
