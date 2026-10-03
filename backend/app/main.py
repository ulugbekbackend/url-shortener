"""Main FastAPI application."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.api import redirect
from app.api.v1 import api_keys, auth, links, stats, tags
from app.core.config import settings
from app.core.database import engine
from app.core.errors import register_error_handlers
from app.core.rate_limit import rate_limit_middleware
from app.core.redis import close_redis, get_redis


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager."""
    # Startup
    await get_redis()
    yield
    # Shutdown
    await close_redis()
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    contact={"name": "Ulugbek Yuldoshev", "url": "https://ulugbekdev.uz"},
    license_info={"name": "MIT", "identifier": "MIT"},
    lifespan=lifespan,
)

register_error_handlers(app)

# Added before CORS so CORS stays outermost and 429 responses carry CORS headers
app.middleware("http")(rate_limit_middleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(links.router, prefix="/api/v1")
app.include_router(stats.router, prefix="/api/v1")
app.include_router(api_keys.router, prefix="/api/v1")
app.include_router(tags.router, prefix="/api/v1")


@app.get("/health/live")
async def health_live() -> dict[str, str]:
    """Liveness check."""
    return {"status": "ok"}


@app.get("/health/ready")
async def health_ready() -> dict[str, str]:
    """Readiness check - verify DB and Redis."""
    try:
        redis = await get_redis()
        await redis.ping()
    except Exception:
        raise HTTPException(status_code=503, detail="Redis not ready") from None

    try:
        async with engine.connect() as conn:
            await conn.execute(select(1))
    except Exception:
        raise HTTPException(status_code=503, detail="Database not ready") from None

    return {"status": "ok"}


# Catch-all short-code routes go last so they never shadow API paths
app.include_router(redirect.router)
