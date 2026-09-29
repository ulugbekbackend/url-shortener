"""Main FastAPI application."""
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse
from sqlalchemy import select

from app.core.config import settings
from app.core.database import engine
from app.core.errors import register_error_handlers
from app.core.redis import get_redis, close_redis
from app.api import redirect
from app.api.v1 import auth, links, stats, api_keys, tags


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
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
)

register_error_handlers(app)

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
async def health_live():
    """Liveness check."""
    return {"status": "ok"}


@app.get("/health/ready")
async def health_ready():
    """Readiness check - verify DB and Redis."""
    try:
        redis = await get_redis()
        await redis.ping()
    except Exception:
        raise HTTPException(status_code=503, detail="Redis not ready")
    
    try:
        async with engine.connect() as conn:
            await conn.execute(select(1))
    except Exception:
        raise HTTPException(status_code=503, detail="Database not ready")
    
    return {"status": "ok"}


# Catch-all short-code routes go last so they never shadow API paths
app.include_router(redirect.router)
