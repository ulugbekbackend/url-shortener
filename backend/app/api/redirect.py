"""Short-code redirect — the hot path.

Link data is cached in Redis; the click counter lives in Redis too, so `max_clicks`
is enforced atomically without touching the database on every hit.
"""
import html
import re
from datetime import UTC, datetime
from typing import Any

import orjson
from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response

from app.core.config import settings
from app.core.database import async_session_factory
from app.core.errors import AppError
from app.core.rate_limit import BRUTE_FORCE_WINDOW, client_ip, enforce
from app.core.redis import get_redis
from app.core.security import verify_password
from app.services.link_service import (
    CLICK_STREAM,
    LinkService,
    click_counter_key,
    link_cache_key,
)

router = APIRouter(tags=["redirect"])

CODE_RE = re.compile(r"^[A-Za-z0-9_-]{1,50}$")
CLICK_STREAM_MAXLEN = 100_000


def _not_found() -> AppError:
    return AppError(404, "LINK_NOT_FOUND", "Link not found")


async def _load_link(code: str) -> dict[str, Any]:
    """Return redirect data for a code from cache, falling back to the database."""
    if not CODE_RE.match(code) or code.lower() in {c.lower() for c in settings.RESERVED_CODES}:
        raise _not_found()

    redis = await get_redis()
    cached = await redis.get(link_cache_key(code))
    if cached:
        data: dict[str, Any] = orjson.loads(cached)
        if data.get("status") == "negative":
            raise _not_found()
        return data

    async with async_session_factory() as session:
        link = await LinkService(session).get_link_by_code(code)

    if not link:
        await redis.setex(link_cache_key(code), settings.NEGATIVE_CACHE_TTL, '{"status": "negative"}')
        raise _not_found()

    data = {
        "url": link.original_url,
        "link_id": str(link.id),
        "is_active": link.is_active,
        "is_permanent": link.is_permanent,
        "expires_at": link.expires_at.isoformat() if link.expires_at else None,
        "max_clicks": link.max_clicks,
        "password_hash": link.password_hash,
    }
    await redis.setex(link_cache_key(code), settings.LINK_CACHE_TTL, orjson.dumps(data))
    # Seed the live counter from the DB total; NX keeps a counter that is already ahead
    await redis.set(click_counter_key(link.id), link.total_clicks, nx=True)
    return data


def _ensure_available(data: dict[str, Any]) -> None:
    if not data["is_active"]:
        raise AppError(410, "LINK_DISABLED", "Link is disabled")
    if data["expires_at"] and datetime.fromisoformat(data["expires_at"]) < datetime.now(UTC):
        raise AppError(410, "LINK_EXPIRED", "Link has expired")


async def _register_click(request: Request, code: str, data: dict[str, Any]) -> None:
    """Count the click (enforcing max_clicks) and queue it for the analytics worker."""
    redis = await get_redis()
    counter = click_counter_key(data["link_id"])
    count = await redis.incr(counter)
    if data["max_clicks"] and count > data["max_clicks"]:
        await redis.decr(counter)
        raise AppError(410, "CLICK_LIMIT_REACHED", "Click limit reached")

    await redis.xadd(
        CLICK_STREAM,
        {
            "code": code,
            "link_id": data["link_id"],
            "timestamp": str(datetime.now(UTC).timestamp()),
            "ip": request.client.host if request.client else "",
            "user_agent": request.headers.get("user-agent", ""),
            "referer": request.headers.get("referer", ""),
            "query": request.url.query,
        },
        maxlen=CLICK_STREAM_MAXLEN,
        approximate=True,
    )


def _password_page(code: str, error: bool = False) -> HTMLResponse:
    safe_code = html.escape(code)
    message = '<p class="err">Wrong password, try again.</p>' if error else ""
    body = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Protected link</title>
<style>
  body {{ font-family: system-ui, sans-serif; background: #f5f5f7; color: #1d1d1f;
         display: grid; place-items: center; min-height: 100vh; margin: 0; }}
  form {{ background: #fff; padding: 2rem; border-radius: 12px; width: min(340px, 90vw);
         box-shadow: 0 4px 24px rgba(0,0,0,.08); }}
  h1 {{ font-size: 1.2rem; margin: 0 0 1rem; }}
  input, button {{ width: 100%; box-sizing: border-box; padding: .7rem; font-size: 1rem;
                   border-radius: 8px; }}
  input {{ border: 1px solid #ccc; margin-bottom: .8rem; }}
  button {{ border: 0; background: #4f46e5; color: #fff; cursor: pointer; }}
  .err {{ color: #c00; margin: 0 0 .8rem; }}
</style></head>
<body><form method="post" action="/{safe_code}/unlock">
  <h1>This link is password protected</h1>
  {message}
  <input type="password" name="password" placeholder="Password" required autofocus>
  <button type="submit">Continue</button>
</form></body></html>"""
    return HTMLResponse(body, status_code=401 if error else 200)


@router.get("/{code}", include_in_schema=False)
async def redirect_link(code: str, request: Request) -> Response:
    """Redirect a short code to its original URL."""
    data = await _load_link(code)
    _ensure_available(data)
    if data.get("password_hash"):
        return _password_page(code)

    await _register_click(request, code, data)
    return RedirectResponse(data["url"], status_code=301 if data["is_permanent"] else 302)


@router.post("/{code}/unlock", include_in_schema=False)
async def unlock_link(code: str, request: Request, password: str = Form(...)) -> Response:
    """Check the password of a protected link and redirect on success."""
    await enforce(
        f"unlock:{code}:{client_ip(request)}", settings.RATE_LIMIT_UNLOCK, BRUTE_FORCE_WINDOW
    )
    data = await _load_link(code)
    _ensure_available(data)
    password_hash = data.get("password_hash")
    if password_hash and not verify_password(password, password_hash):
        return _password_page(code, error=True)

    await _register_click(request, code, data)
    # 303 turns the POST into a GET on the target
    return RedirectResponse(data["url"], status_code=303)
