import json
from typing import List, Optional, Union, Any
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "AICTE Approval Intelligence Platform API"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"

    # CORS Origins allowed to communicate with backend
    CORS_ORIGINS: Union[List[str], str] = [
        "https://aip-frontend-zeta.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
    ]

    @field_validator("CORS_ORIGINS", mode="after")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> List[str]:
        """Supports JSON array string, comma-separated string, or list."""
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("[") and v.endswith("]"):
                try:
                    parsed = json.loads(v)
                    if isinstance(parsed, list):
                        return [str(item).strip().rstrip("/") for item in parsed if str(item).strip()]
                except Exception:
                    pass
            return [item.strip().rstrip("/") for item in v.split(",") if item.strip()]
        if isinstance(v, (list, tuple, set)):
            return [str(item).strip().rstrip("/") for item in v if str(item).strip()]
        return v


    # Supabase Auth Configuration (Module 2 & 3)
    SUPABASE_URL: Optional[str] = None
    SUPABASE_PUBLISHABLE_KEY: Optional[str] = None
    SUPABASE_ANON_KEY: Optional[str] = None
    SUPABASE_JWT_SECRET: Optional[str] = None
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None

    # Next.js environment compatibility
    NEXT_PUBLIC_SUPABASE_URL: Optional[str] = None
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: Optional[str] = None

    @property
    def supabase_url(self) -> Optional[str]:
        return self.SUPABASE_URL or self.NEXT_PUBLIC_SUPABASE_URL

    @property
    def supabase_key(self) -> Optional[str]:
        return self.SUPABASE_PUBLISHABLE_KEY or self.SUPABASE_ANON_KEY or self.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
