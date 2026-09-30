"""Core configuration module."""

import json
from typing import Annotated, Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore"
    )

    # Application
    APP_NAME: str = "Linkly"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "production"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 4

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5433/url_shortener"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    # Refresh-token cookie must be Secure in production; set false only for plain-http dev
    COOKIE_SECURE: bool = True

    # CORS
    BACKEND_CORS_ORIGINS: Annotated[list[str], NoDecode] = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]

    # Rate Limiting
    RATE_LIMIT_ANONYMOUS: int = 100  # requests per hour
    RATE_LIMIT_USER: int = 1000
    RATE_LIMIT_API_KEY: int = 10000
    RATE_LIMIT_WINDOW: int = 3600  # seconds, for the three limits above
    # Brute-force guards, per client IP per 15 minutes
    RATE_LIMIT_LOGIN: int = 10
    RATE_LIMIT_UNLOCK: int = 10

    # GeoIP
    GEOLITE2_PATH: str = "/app/data/GeoLite2-City.mmdb"

    # Application
    SHORT_DOMAIN: str = "lnk.ly"
    BASE_URL: str = "https://lnk.ly"

    # Blocked domains
    BLOCKED_DOMAINS: Annotated[list[str], NoDecode] = []

    # Reserved words for custom codes
    RESERVED_CODES: Annotated[list[str], NoDecode] = [
        "api",
        "docs",
        "health",
        "login",
        "admin",
        "register",
        "settings",
        "dashboard",
        "links",
        "auth",
        "static",
        "assets",
        "redoc",
    ]

    # Click processing
    CLICK_BATCH_SIZE: int = 500
    CLICK_BATCH_TIMEOUT: int = 2  # seconds

    # Cache TTL
    LINK_CACHE_TTL: int = 86400  # 24 hours
    NEGATIVE_CACHE_TTL: int = 60  # 1 minute

    @field_validator("BACKEND_CORS_ORIGINS", "BLOCKED_DOMAINS", "RESERVED_CODES", mode="before")
    @classmethod
    def split_list(cls, v: Any) -> Any:
        """Accept JSON arrays or comma-separated strings from env."""
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("["):
                return json.loads(v)
            return [item.strip() for item in v.split(",") if item.strip()]
        return v


settings = Settings()
