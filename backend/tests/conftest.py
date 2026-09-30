"""Test setup: real PostgreSQL and Redis, isolated from development data.

Needs the compose services (`docker compose up -d postgres redis`) and a database named
`url_shortener_test` (override with TEST_DATABASE_URL / TEST_REDIS_URL). The schema is
built with Alembic, so every run also checks the migrations on an empty database.
"""

import asyncio
import os
import uuid
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

# Must be set before the app (and its engine/settings) is imported
os.environ["DATABASE_URL"] = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5433/url_shortener_test",
)
os.environ["REDIS_URL"] = os.getenv("TEST_REDIS_URL", "redis://localhost:6379/15")
os.environ["SECRET_KEY"] = "test-secret-key-that-is-at-least-32-bytes-long"
os.environ["COOKIE_SECURE"] = "false"
os.environ["BASE_URL"] = "http://short.test"
os.environ["SHORT_DOMAIN"] = "short.test"
# Generous limits; rate limiting tests lower them explicitly
os.environ["RATE_LIMIT_ANONYMOUS"] = "100000"
os.environ["RATE_LIMIT_LOGIN"] = "100000"
os.environ["RATE_LIMIT_UNLOCK"] = "100000"

import httpx  # noqa: E402
import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.database import async_session_factory, engine  # noqa: E402
from app.core.redis import close_redis, get_redis  # noqa: E402
from app.main import app  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parent.parent
TABLES = "users, links, tags, link_tags, clicks, link_daily_stats, refresh_tokens, api_keys"


@pytest.fixture(scope="session", autouse=True)
async def database() -> AsyncIterator[None]:
    """Recreate the schema from migrations once per test run."""
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
    await engine.dispose()

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    # env.py runs its own event loop; run it off this one
    await asyncio.to_thread(command.upgrade, config, "head")
    yield
    await close_redis()
    await engine.dispose()


@pytest.fixture(autouse=True)
async def clean_state() -> AsyncIterator[None]:
    """Every test starts with empty tables and an empty Redis database."""
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE"))
    redis = await get_redis()
    await redis.flushdb()
    yield


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
async def db() -> AsyncIterator[Any]:
    async with async_session_factory() as session:
        yield session


async def register(
    client: httpx.AsyncClient, email: str | None = None, password: str = "secret123"
) -> dict[str, Any]:
    """Create an account and sign in; returns email, password, token and auth headers."""
    email = email or f"user-{uuid.uuid4().hex[:8]}@example.com"
    res = await client.post(
        "/api/v1/auth/register", json={"email": email, "password": password, "name": "Tester"}
    )
    assert res.status_code == 201, res.text
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    token = res.json()["access_token"]
    return {
        "email": email,
        "password": password,
        "token": token,
        "headers": {"Authorization": f"Bearer {token}"},
        "id": res.json()["user"]["id"],
    }


@pytest.fixture
async def user(client: httpx.AsyncClient) -> dict[str, Any]:
    return await register(client)


async def create_link(
    client: httpx.AsyncClient, headers: dict[str, str], **fields: Any
) -> dict[str, Any]:
    body = {"url": "https://example.com/page", **fields}
    res = await client.post("/api/v1/links", json=body, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()
