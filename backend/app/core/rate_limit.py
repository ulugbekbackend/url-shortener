"""Sliding-window rate limiting backed by Redis.

Every /api request is counted against one bucket per hour: the user (valid JWT), the API key
(valid key) or otherwise the client IP. Login and link unlock additionally have tight
per-IP limits against password guessing. If Redis is unavailable requests are let through.
"""
import logging
import time
import uuid
from dataclasses import dataclass
from typing import Awaitable, Callable, Optional

from fastapi import Request, Response
from fastapi.responses import ORJSONResponse
from redis.exceptions import RedisError
from sqlalchemy import select

from app.core.config import settings
from app.core.database import async_session_factory
from app.core.errors import AppError, error_body
from app.core.redis import get_redis
from app.core.security import decode_token, hash_token
from app.models.models import ApiKey


log = logging.getLogger(__name__)

BRUTE_FORCE_WINDOW = 15 * 60
API_KEY_CACHE_TTL = 300

# Drop hits older than the window, then admit the request only if under the limit.
# Returns {allowed, count, ms until the oldest hit expires}.
_SLIDING_WINDOW = """
local key, now, window, limit = KEYS[1], tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return {0, count, tonumber(oldest[2]) + window - now}
end
redis.call('ZADD', key, now, ARGV[4])
redis.call('PEXPIRE', key, window)
return {1, count + 1, 0}
"""


@dataclass
class RateLimitResult:
    allowed: bool
    limit: int
    remaining: int
    retry_after: int  # seconds

    @property
    def headers(self) -> dict[str, str]:
        headers = {"X-RateLimit-Limit": str(self.limit), "X-RateLimit-Remaining": str(self.remaining)}
        if not self.allowed:
            headers["Retry-After"] = str(self.retry_after)
        return headers


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


async def hit(bucket: str, limit: int, window: int) -> Optional[RateLimitResult]:
    """Count one request in `bucket`; None if Redis is unavailable (fail open)."""
    now_ms = int(time.time() * 1000)
    try:
        redis = await get_redis()
        allowed, count, wait_ms = await redis.eval(
            _SLIDING_WINDOW, 1, f"rl:{bucket}", now_ms, window * 1000, limit, uuid.uuid4().hex
        )
    except RedisError:
        log.warning("rate limiter unavailable, allowing request", exc_info=True)
        return None
    return RateLimitResult(
        allowed=bool(allowed),
        limit=limit,
        remaining=max(0, limit - int(count)),
        retry_after=max(1, -(-int(wait_ms) // 1000)),
    )


def _too_many(result: RateLimitResult) -> AppError:
    return AppError(
        429,
        "RATE_LIMITED",
        f"Too many requests, retry in {result.retry_after} seconds",
        details={"retry_after": result.retry_after},
        headers=result.headers,
    )


async def enforce(bucket: str, limit: int, window: int) -> None:
    """Raise 429 if `bucket` is over its limit."""
    result = await hit(bucket, limit, window)
    if result is not None and not result.allowed:
        raise _too_many(result)


async def _api_key_valid(api_key: str) -> tuple[bool, str]:
    """Whether a key exists and is not revoked, cached briefly to spare the database."""
    key_hash = hash_token(api_key)
    redis = await get_redis()
    cache_key = f"apikey:{key_hash}"
    cached = await redis.get(cache_key)
    if cached is None:
        async with async_session_factory() as session:
            found = await session.scalar(
                select(ApiKey.id).where(ApiKey.key_hash == key_hash, ApiKey.revoked_at.is_(None))
            )
        cached = "1" if found else "0"
        await redis.setex(cache_key, API_KEY_CACHE_TTL, cached)
    return cached == "1", key_hash


async def _identify(request: Request) -> tuple[str, int]:
    """Pick the bucket and hourly limit for a request."""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        payload = decode_token(auth[7:])
        if payload and payload.get("type") == "access" and payload.get("sub"):
            return f"user:{payload['sub']}", settings.RATE_LIMIT_USER

    api_key = request.headers.get("x-api-key")
    if api_key:
        try:
            valid, key_hash = await _api_key_valid(api_key)
        except RedisError:
            valid = False
        # Only a real key earns the higher limit, so random keys can't dodge the IP limit
        if valid:
            return f"apikey:{key_hash[:32]}", settings.RATE_LIMIT_API_KEY

    return f"ip:{client_ip(request)}", settings.RATE_LIMIT_ANONYMOUS


async def rate_limit_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """Apply the hourly limit to API requests and expose X-RateLimit-* headers."""
    if not request.url.path.startswith("/api/") or request.method == "OPTIONS":
        return await call_next(request)

    bucket, limit = await _identify(request)
    result = await hit(bucket, limit, settings.RATE_LIMIT_WINDOW)
    if result is None:
        return await call_next(request)
    if not result.allowed:
        error = _too_many(result)
        return ORJSONResponse(
            error_body(error.code, error.message, error.details),
            status_code=429,
            headers=result.headers,
        )

    response = await call_next(request)
    response.headers.update(result.headers)
    return response
