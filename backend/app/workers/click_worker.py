"""Click worker: moves click events from the Redis stream into Postgres.

Run with:  python -m app.workers.click_worker

Events are read through a consumer group, so several workers can share the load and
events left unacknowledged by a crashed worker are claimed by another one. Delivery is
at-least-once; the unique `clicks.stream_id` makes storing a redelivered event a no-op.
"""
import asyncio
import contextlib
import logging
import os
import signal
import socket
from collections import Counter
from datetime import timedelta
from typing import Any

from redis.asyncio import Redis
from redis.exceptions import ResponseError
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import async_session_factory, engine
from app.core.redis import close_redis, get_redis
from app.models.models import Click, Link, LinkDailyStats
from app.services.click_enrichment import GeoLookup, build_click
from app.services.link_service import CLICK_STREAM


log = logging.getLogger("click_worker")

GROUP = "click-workers"
# Events pending longer than this belong to a dead consumer and are taken over
CLAIM_IDLE_MS = 60_000
RETRY_DELAY_SECONDS = 5

Event = tuple[str, dict[str, str]]


async def ensure_group(redis: Redis) -> None:
    """Create the consumer group; id=0 so events queued before the first start are processed."""
    try:
        await redis.xgroup_create(CLICK_STREAM, GROUP, id="0", mkstream=True)
    except ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise


async def read_batch(redis: Redis, consumer: str) -> list[Event]:
    """Return abandoned events first, otherwise wait for new ones."""
    _, claimed, *_ = await redis.xautoclaim(
        CLICK_STREAM,
        GROUP,
        consumer,
        min_idle_time=CLAIM_IDLE_MS,
        start_id="0-0",
        count=settings.CLICK_BATCH_SIZE,
    )
    if claimed:
        return claimed

    response = await redis.xreadgroup(
        GROUP,
        consumer,
        {CLICK_STREAM: ">"},
        count=settings.CLICK_BATCH_SIZE,
        block=settings.CLICK_BATCH_TIMEOUT * 1000,
    )
    return response[0][1] if response else []


async def store_batch(session: AsyncSession, events: list[Event], geo: GeoLookup) -> int:
    """Insert clicks, bump link counters and refresh daily stats. Returns rows stored."""
    rows = [row for event_id, fields in events if (row := build_click(event_id, fields, geo))]
    if not rows:
        return 0

    # Links deleted after the click was queued would violate the foreign key
    existing = set(
        await session.scalars(select(Link.id).where(Link.id.in_({r["link_id"] for r in rows})))
    )
    rows = [r for r in rows if r["link_id"] in existing]
    if not rows:
        return 0

    inserted = (
        await session.execute(
            pg_insert(Click)
            .values(rows)
            .on_conflict_do_nothing(constraint="uq_clicks_stream_id")
            .returning(Click.link_id, Click.clicked_at)
        )
    ).all()
    if not inserted:
        return 0

    for link_id, count in Counter(link_id for link_id, _ in inserted).items():
        await session.execute(
            update(Link).where(Link.id == link_id).values(total_clicks=Link.total_clicks + count)
        )

    await _refresh_daily_stats(session, inserted)
    return len(inserted)


async def _refresh_daily_stats(session: AsyncSession, inserted: list[Any]) -> None:
    """Recompute the touched (link, UTC day) rows from `clicks`, so unique counts stay exact."""
    link_ids = {link_id for link_id, _ in inserted}
    first_day = min(clicked_at for _, clicked_at in inserted).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    last_day = max(clicked_at for _, clicked_at in inserted)

    day = func.date_trunc("day", Click.clicked_at, "UTC")
    aggregated = (
        select(
            Click.link_id,
            day,
            func.count(),
            func.count(func.distinct(Click.visitor_hash)),
            func.count().filter(Click.is_bot),
        )
        .where(
            Click.link_id.in_(link_ids),
            Click.clicked_at >= first_day,
            Click.clicked_at < last_day + timedelta(days=1),
        )
        .group_by(Click.link_id, day)
    )
    stmt = pg_insert(LinkDailyStats).from_select(
        ["link_id", "day", "clicks", "unique_visitors", "bot_clicks"], aggregated
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["link_id", "day"],
        set_={
            "clicks": stmt.excluded.clicks,
            "unique_visitors": stmt.excluded.unique_visitors,
            "bot_clicks": stmt.excluded.bot_clicks,
        },
    )
    await session.execute(stmt)


async def run(stop: asyncio.Event) -> None:
    redis = await get_redis()
    await ensure_group(redis)
    consumer = os.getenv("WORKER_NAME") or f"{socket.gethostname()}-{os.getpid()}"
    geo = GeoLookup(settings.GEOLITE2_PATH)
    log.info("started as consumer %r in group %r", consumer, GROUP)

    try:
        while not stop.is_set():
            try:
                events = await read_batch(redis, consumer)
                if not events:
                    continue
                async with async_session_factory() as session:
                    stored = await store_batch(session, events, geo)
                    await session.commit()
                # Ack only after commit: a crash in between means redelivery, not loss
                await redis.xack(CLICK_STREAM, GROUP, *(event_id for event_id, _ in events))
                log.info("processed %d events, stored %d clicks", len(events), stored)
            except Exception:
                log.exception("batch failed, retrying in %ds", RETRY_DELAY_SECONDS)
                await asyncio.sleep(RETRY_DELAY_SECONDS)
    finally:
        geo.close()
        await close_redis()
        await engine.dispose()
        log.info("stopped")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    async def _main() -> None:
        stop = asyncio.Event()
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            # Windows: unsupported, Ctrl+C arrives as KeyboardInterrupt instead
            with contextlib.suppress(NotImplementedError):
                loop.add_signal_handler(sig, stop.set)
        await run(stop)

    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(_main())


if __name__ == "__main__":
    main()
