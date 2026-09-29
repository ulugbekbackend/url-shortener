"""Main FastAPI application."""
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import AsyncGenerator

import orjson
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse, RedirectResponse
from sqlalchemy import select

from app.core.config import settings
from app.core.database import async_session_factory, engine
from app.core.errors import register_error_handlers
from app.core.redis import get_redis, close_redis
from app.api.v1 import auth, links, stats, api_keys
from app.services.link_service import LinkService


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


@app.get("/{code}")
async def redirect_link(code: str):
    """Redirect short code to original URL."""
    # Check Redis cache first
    redis = await get_redis()
    cached = await redis.get(f"link:{code}")
    
    if cached:
        data = orjson.loads(cached)
        if data.get("status") == "negative":
            raise HTTPException(status_code=404, detail="Link not found")
        
        # Check if link is active
        if not data.get("is_active"):
            raise HTTPException(status_code=410, detail="Link is disabled")
        
        # Check expiry
        if data.get("expires_at"):
            expires = datetime.fromisoformat(data["expires_at"])
            if expires < datetime.now(timezone.utc):
                raise HTTPException(status_code=410, detail="Link has expired")
        
        # Check max clicks
        if data.get("max_clicks"):
            if data.get("total_clicks", 0) >= data["max_clicks"]:
                raise HTTPException(status_code=410, detail="Click limit reached")
        
        # Push click event to Redis stream
        await redis.xadd(
            "clicks",
            {
                "code": code,
                "link_id": data.get("link_id", ""),
                "timestamp": str(datetime.now(timezone.utc).timestamp()),
            },
            maxlen=100000,
            approximate=True,
        )
        
        # Increment click counter
        await redis.incr(f"clicks:{data.get('link_id', '')}")
        
        status_code = 301 if data.get("is_permanent") else 302
        return RedirectResponse(url=data["url"], status_code=status_code)
    
    # Cache miss - check database
    async with async_session_factory() as session:
        service = LinkService(session)
        link = await service.get_link_by_code(code)
        
        if not link:
            # Negative cache
            await redis.setex(f"link:{code}", settings.NEGATIVE_CACHE_TTL, 
                            '{"status": "negative"}')
            raise HTTPException(status_code=404, detail="Link not found")
        
        if not link.is_active:
            raise HTTPException(status_code=410, detail="Link is disabled")
        
        if link.expires_at and link.expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=410, detail="Link has expired")
        
        if link.max_clicks and link.total_clicks >= link.max_clicks:
            raise HTTPException(status_code=410, detail="Click limit reached")
        
        # Cache the link data
        cache_data = {
            "url": link.original_url,
            "link_id": str(link.id),
            "is_active": link.is_active,
            "is_permanent": link.is_permanent,
            "expires_at": link.expires_at.isoformat() if link.expires_at else None,
            "max_clicks": link.max_clicks,
            "total_clicks": link.total_clicks,
        }
        await redis.setex(f"link:{code}", settings.LINK_CACHE_TTL, orjson.dumps(cache_data))
        
        # Push click event
        await redis.xadd(
            "clicks",
            {
                "code": code,
                "link_id": str(link.id),
                "timestamp": str(datetime.now(timezone.utc).timestamp()),
            },
            maxlen=100000,
            approximate=True,
        )
        
        # Increment click counter
        await redis.incr(f"clicks:{link.id}")
        
        status_code = 301 if link.is_permanent else 302
        return RedirectResponse(url=link.original_url, status_code=status_code)
