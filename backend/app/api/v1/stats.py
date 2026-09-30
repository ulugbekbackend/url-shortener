"""Stats API endpoints.

`/stats/...` aggregates over all of the user's links, `/stats/links/{id}/...` over one link.
Bots are left out of unique visitors, and out of timeseries and breakdowns unless
`include_bots=true`.
"""

from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_or_api_key
from app.core.database import get_db
from app.core.errors import AppError
from app.models.models import Click, Link, User
from app.schemas.schemas import BreakdownItem, OverviewStats, StatsSummary, TimeSeriesPoint
from app.services.link_service import LinkService

router = APIRouter(prefix="/stats", tags=["stats"])

Interval = Literal["hour", "day", "week"]
Dimension = Literal["country", "city", "device", "os", "browser", "referrer", "utm_source"]

DEFAULT_RANGE = timedelta(days=30)
MAX_BUCKETS = 2000
INTERVAL_STEP = {"hour": timedelta(hours=1), "day": timedelta(days=1), "week": timedelta(weeks=1)}
DIMENSION_COLUMNS = {
    "country": Click.country_code,
    "city": Click.city,
    "device": Click.device_type,
    "os": Click.os,
    "browser": Click.browser,
    "referrer": Click.referrer_domain,
    "utm_source": Click.utm_source,
}


def _utc(value: datetime | None) -> datetime | None:
    """Treat naive query datetimes as UTC."""
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _range(from_date: datetime | None, to_date: datetime | None) -> tuple[datetime, datetime]:
    """Resolve an optional range to concrete bounds, defaulting to the last 30 days."""
    end = _utc(to_date) or datetime.now(UTC)
    start = _utc(from_date) or end - DEFAULT_RANGE
    if start > end:
        raise AppError(400, "INVALID_RANGE", "from_date must be before to_date")
    return start, end


def _period_filters(
    from_date: datetime | None, to_date: datetime | None
) -> list[ColumnElement[bool]]:
    filters = []
    if from_date:
        filters.append(Click.clicked_at >= _utc(from_date))
    if to_date:
        filters.append(Click.clicked_at <= _utc(to_date))
    return filters


def _user_scope(user: User) -> list[ColumnElement[bool]]:
    return [Click.link_id.in_(select(Link.id).where(Link.user_id == user.id))]


async def _link_scope(db: AsyncSession, link_id: UUID, user: User) -> list[ColumnElement[bool]]:
    """Scope to one link, 404 if it does not belong to the user."""
    if not await LinkService(db).get_link_by_id(link_id, user.id):
        raise AppError(404, "LINK_NOT_FOUND", "Link not found")
    return [Click.link_id == link_id]


def _truncate(moment: datetime, interval: Interval) -> datetime:
    """Python twin of Postgres date_trunc in UTC (weeks start on Monday)."""
    moment = moment.astimezone(UTC)
    if interval == "hour":
        return moment.replace(minute=0, second=0, microsecond=0)
    day = moment.replace(hour=0, minute=0, second=0, microsecond=0)
    return day - timedelta(days=day.weekday()) if interval == "week" else day


async def _summary(db: AsyncSession, scope: list[ColumnElement[bool]]) -> StatsSummary:
    row = (
        await db.execute(
            select(
                func.count(),
                func.count(func.distinct(Click.visitor_hash)).filter(~Click.is_bot),
                func.count().filter(Click.is_bot),
                func.min(Click.clicked_at),
            ).where(*scope)
        )
    ).one()
    total, unique, bots, first_click = row
    days = max(1, (datetime.now(UTC) - first_click).days) if first_click else 1
    return StatsSummary(
        total_clicks=total,
        unique_visitors=unique,
        bot_clicks=bots,
        avg_clicks_per_day=round(total / days, 2) if total else 0,
    )


async def _timeseries(
    db: AsyncSession,
    scope: list[ColumnElement[bool]],
    start: datetime,
    end: datetime,
    interval: Interval,
    include_bots: bool,
) -> list[TimeSeriesPoint]:
    step = INTERVAL_STEP[interval]
    first_bucket = _truncate(start, interval)
    if (end - first_bucket) / step > MAX_BUCKETS:
        raise AppError(400, "RANGE_TOO_LARGE", f"Range is too large for interval '{interval}'")

    bucket = func.date_trunc(interval, Click.clicked_at, "UTC")
    filters = [*scope, Click.clicked_at >= start, Click.clicked_at <= end]
    if not include_bots:
        filters.append(~Click.is_bot)
    rows = (
        await db.execute(
            select(bucket, func.count(), func.count(func.distinct(Click.visitor_hash)))
            .where(*filters)
            .group_by(bucket)
        )
    ).all()
    by_bucket: dict[datetime, Any] = {period: (clicks, unique) for period, clicks, unique in rows}

    # Emit every bucket so charts show gaps as zeros
    points = []
    current = first_bucket
    while current <= end:
        clicks, unique = by_bucket.get(current, (0, 0))
        points.append(TimeSeriesPoint(date=current, clicks=clicks, unique_visitors=unique))
        current += step
    return points


async def _breakdown(
    db: AsyncSession,
    scope: list[ColumnElement[bool]],
    dimension: Dimension,
    filters: list[ColumnElement[bool]],
    limit: int,
    include_bots: bool,
) -> list[BreakdownItem]:
    column = DIMENSION_COLUMNS[dimension]
    conditions = [*scope, *filters, column.isnot(None)]
    if not include_bots:
        conditions.append(~Click.is_bot)
    count = func.count()
    rows = (
        await db.execute(
            # The window total is computed before LIMIT, so percentages cover all values
            select(column, count, func.sum(count).over())
            .where(*conditions)
            .group_by(column)
            .order_by(count.desc())
            .limit(limit)
        )
    ).all()
    return [
        BreakdownItem(name=name, count=cnt, percentage=round(cnt / total * 100, 1))
        for name, cnt, total in rows
    ]


@router.get("/overview", response_model=OverviewStats)
async def get_overview(
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
    current_user: User = Depends(get_current_user_or_api_key),
    db: AsyncSession = Depends(get_db),
) -> OverviewStats:
    """Account-wide totals; with a range, click metrics cover only that range."""
    scope = _user_scope(current_user)
    period = _period_filters(from_date, to_date)

    total_links = await db.scalar(
        select(func.count(Link.id)).where(Link.user_id == current_user.id)
    )
    if period:
        total_clicks = await db.scalar(select(func.count()).where(*scope, *period))
    else:
        total_clicks = await db.scalar(
            select(func.coalesce(func.sum(Link.total_clicks), 0)).where(
                Link.user_id == current_user.id
            )
        )
    today_start = _truncate(datetime.now(UTC), "day")
    clicks_today = await db.scalar(
        select(func.count()).where(*scope, Click.clicked_at >= today_start)
    )
    unique_visitors = await db.scalar(
        select(func.count(func.distinct(Click.visitor_hash))).where(*scope, *period, ~Click.is_bot)
    )
    return OverviewStats(
        total_links=total_links or 0,
        total_clicks=total_clicks or 0,
        clicks_today=clicks_today or 0,
        unique_visitors=unique_visitors or 0,
    )


@router.get("/timeseries", response_model=list[TimeSeriesPoint])
async def get_timeseries(
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
    interval: Interval = Query("day"),
    include_bots: bool = Query(False),
    current_user: User = Depends(get_current_user_or_api_key),
    db: AsyncSession = Depends(get_db),
) -> list[TimeSeriesPoint]:
    """Clicks over time across all of the user's links."""
    start, end = _range(from_date, to_date)
    return await _timeseries(db, _user_scope(current_user), start, end, interval, include_bots)


@router.get("/breakdown", response_model=list[BreakdownItem])
async def get_breakdown(
    dimension: Dimension = Query(...),
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
    limit: int = Query(10, ge=1, le=50),
    include_bots: bool = Query(False),
    current_user: User = Depends(get_current_user_or_api_key),
    db: AsyncSession = Depends(get_db),
) -> list[BreakdownItem]:
    """Top values of a dimension across all of the user's links."""
    return await _breakdown(
        db,
        _user_scope(current_user),
        dimension,
        _period_filters(from_date, to_date),
        limit,
        include_bots,
    )


@router.get("/links/{link_id}/summary", response_model=StatsSummary)
async def get_link_summary(
    link_id: UUID,
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
    current_user: User = Depends(get_current_user_or_api_key),
    db: AsyncSession = Depends(get_db),
) -> StatsSummary:
    """Summary stats for a specific link (all time unless a range is given)."""
    scope = await _link_scope(db, link_id, current_user)
    return await _summary(db, [*scope, *_period_filters(from_date, to_date)])


@router.get("/links/{link_id}/timeseries", response_model=list[TimeSeriesPoint])
async def get_link_timeseries(
    link_id: UUID,
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
    interval: Interval = Query("day"),
    include_bots: bool = Query(False),
    current_user: User = Depends(get_current_user_or_api_key),
    db: AsyncSession = Depends(get_db),
) -> list[TimeSeriesPoint]:
    """Clicks over time for a link."""
    scope = await _link_scope(db, link_id, current_user)
    start, end = _range(from_date, to_date)
    return await _timeseries(db, scope, start, end, interval, include_bots)


@router.get("/links/{link_id}/breakdown", response_model=list[BreakdownItem])
async def get_link_breakdown(
    link_id: UUID,
    dimension: Dimension = Query(...),
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
    limit: int = Query(10, ge=1, le=50),
    include_bots: bool = Query(False),
    current_user: User = Depends(get_current_user_or_api_key),
    db: AsyncSession = Depends(get_db),
) -> list[BreakdownItem]:
    """Top values of a dimension for a link."""
    scope = await _link_scope(db, link_id, current_user)
    return await _breakdown(
        db, scope, dimension, _period_filters(from_date, to_date), limit, include_bots
    )
