from datetime import UTC, datetime
from typing import Any

import httpx
from sqlalchemy import select

from app.core.database import async_session_factory
from app.core.redis import get_redis
from app.models.models import Click, Link, LinkDailyStats
from app.services.click_enrichment import GeoLookup, build_click
from app.services.link_service import CLICK_STREAM
from app.workers.click_worker import store_batch
from tests.conftest import create_link

API = "/api/v1"
CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36"
IPHONE = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)
NO_GEO = GeoLookup("")


async def run_worker_once() -> int:
    """Store everything currently in the click stream, like one worker batch."""
    redis = await get_redis()
    events = await redis.xrange(CLICK_STREAM)
    async with async_session_factory() as session:
        stored = await store_batch(session, events, NO_GEO)
        await session.commit()
    return stored


async def click(client: httpx.AsyncClient, code: str, ua: str, referer: str = "") -> None:
    headers = {"User-Agent": ua, **({"Referer": referer} if referer else {})}
    res = await client.get(f"/{code}", headers=headers)
    assert res.status_code == 302


def test_enrichment_classifies_devices_bots_and_sources() -> None:
    base = {"link_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7", "timestamp": "1790678020"}
    row: Any = build_click(
        "1-0",
        {
            **base,
            "user_agent": IPHONE,
            "referer": "https://www.google.com/x",
            "query": "utm_source=g",
        },
        NO_GEO,
    )
    assert (row["device_type"], row["os"], row["is_bot"]) == ("mobile", "iOS", False)
    assert (row["referrer_domain"], row["utm_source"]) == ("google.com", "g")

    for ua in ("TelegramBot (like TwitterBot)", "curl/8.8.0", ""):
        assert build_click("2-0", {**base, "user_agent": ua}, NO_GEO)["is_bot"] is True  # type: ignore[index]

    assert build_click("3-0", {"code": "x"}, NO_GEO) is None  # malformed event


async def test_worker_stores_clicks_once_and_updates_counters(
    client: httpx.AsyncClient, user: dict
) -> None:
    link = await create_link(client, user["headers"])
    await click(client, link["code"], CHROME, "https://t.me/x")
    await click(client, link["code"], IPHONE)

    assert await run_worker_once() == 2
    # The same events delivered again (e.g. after a worker crash) are not stored twice
    assert await run_worker_once() == 0

    async with async_session_factory() as session:
        stored = (await session.scalars(select(Click))).all()
        total = await session.scalar(select(Link.total_clicks))
        daily = (await session.scalars(select(LinkDailyStats))).one()
    assert len(stored) == 2 and total == 2
    assert {c.device_type for c in stored} == {"desktop", "mobile"}
    assert (daily.clicks, daily.unique_visitors, daily.bot_clicks) == (2, 2, 0)


async def test_worker_skips_clicks_of_deleted_links(client: httpx.AsyncClient, user: dict) -> None:
    link = await create_link(client, user["headers"])
    await click(client, link["code"], CHROME)
    await client.delete(f"{API}/links/{link['id']}", headers=user["headers"])
    assert await run_worker_once() == 0


async def test_link_stats_endpoints(client: httpx.AsyncClient, user: dict) -> None:
    h = user["headers"]
    link = await create_link(client, h)
    base = f"{API}/stats/links/{link['id']}"
    for ua in (CHROME, CHROME, IPHONE, "TelegramBot (like TwitterBot)"):
        await click(client, link["code"], ua)
    await run_worker_once()

    summary = (await client.get(f"{base}/summary", headers=h)).json()
    assert summary["total_clicks"] == 4 and summary["bot_clicks"] == 1
    assert summary["unique_visitors"] == 2  # Chrome and iPhone; bots aren't visitors

    series = (await client.get(f"{base}/timeseries?interval=day", headers=h)).json()
    assert len(series) >= 30  # empty days are filled in
    assert sum(p["clicks"] for p in series) == 3  # bots excluded by default
    today = series[-1]
    assert today["date"].startswith(datetime.now(UTC).date().isoformat())

    devices = (await client.get(f"{base}/breakdown?dimension=device", headers=h)).json()
    assert devices == [
        {"name": "desktop", "count": 2, "percentage": 66.7},
        {"name": "mobile", "count": 1, "percentage": 33.3},
    ]
    browsers = (
        await client.get(f"{base}/breakdown?dimension=browser&include_bots=true", headers=h)
    ).json()
    assert "TelegramBot" in {b["name"] for b in browsers}


async def test_account_overview_and_parameter_validation(
    client: httpx.AsyncClient, user: dict
) -> None:
    h = user["headers"]
    first = await create_link(client, h)
    await create_link(client, h, url="https://example.com/other")
    await click(client, first["code"], CHROME)
    await run_worker_once()

    overview = (await client.get(f"{API}/stats/overview", headers=h)).json()
    assert overview == {
        "total_links": 2,
        "total_clicks": 1,
        "clicks_today": 1,
        "unique_visitors": 1,
    }

    account = (await client.get(f"{API}/stats/breakdown?dimension=os", headers=h)).json()
    assert account == [{"name": "Windows", "count": 1, "percentage": 100.0}]

    bad_interval = await client.get(f"{API}/stats/timeseries?interval=month", headers=h)
    assert bad_interval.status_code == 422
    backwards = await client.get(
        f"{API}/stats/timeseries?from_date=2026-10-01T00:00:00Z&to_date=2026-09-01T00:00:00Z",
        headers=h,
    )
    assert backwards.status_code == 400
    too_many = await client.get(
        f"{API}/stats/timeseries?interval=hour&from_date=2025-01-01T00:00:00Z", headers=h
    )
    assert too_many.status_code == 400 and too_many.json()["error"]["code"] == "RANGE_TOO_LARGE"
