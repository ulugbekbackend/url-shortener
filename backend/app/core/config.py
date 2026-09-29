"""Core configuration module."""
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
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
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/linkly"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Security
    SECRET_KEY: str = "change-this-in-production-use-openssl-rand-hex-32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]
    
    # Rate Limiting
    RATE_LIMIT_ANONYMOUS: int = 100  # requests per hour
    RATE_LIMIT_USER: int = 1000
    RATE_LIMIT_API_KEY: int = 10000
    
    # GeoIP
    GEOLITE2_PATH: str = "/app/data/GeoLite2-City.mmdb"
    
    # Application
    SHORT_DOMAIN: str = "lnk.ly"
    BASE_URL: str = "https://lnk.ly"
    
    # Blocked domains
    BLOCKED_DOMAINS: List[str] = []
    
    # Reserved words for custom codes
    RESERVED_CODES: List[str] = [
        "api", "docs", "health", "login", "admin", "register",
        "settings", "dashboard", "links", "auth", "static", "assets"
    ]
    
    # Click processing
    CLICK_BATCH_SIZE: int = 500
    CLICK_BATCH_TIMEOUT: int = 2  # seconds
    
    # Cache TTL
    LINK_CACHE_TTL: int = 86400  # 24 hours
    NEGATIVE_CACHE_TTL: int = 60  # 1 minute


settings = Settings()
