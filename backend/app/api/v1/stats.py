"""Stats API endpoints."""
from datetime import datetime, timezone, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func, and_, case, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user
from app.schemas.schemas import StatsSummary, TimeSeriesPoint, BreakdownItem, OverviewStats
from app.models.models import User, Link, Click, LinkDailyStats
from app.services.link_service import LinkService


router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/overview", response_model=OverviewStats)
async def get_overview(
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get account-wide overview stats."""
    # Count links
    link_count_result = await db.execute(
        select(func.count(Link.id)).where(Link.user_id == current_user.id)
    )
    total_links = link_count_result.scalar() or 0
    
    # Total clicks
    clicks_result = await db.execute(
        select(func.sum(Link.total_clicks)).where(Link.user_id == current_user.id)
    )
    total_clicks = clicks_result.scalar() or 0
    
    # Clicks today
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_result = await db.execute(
        select(func.count(Click.id))
        .join(Link)
        .where(
            and_(
                Link.user_id == current_user.id,
                Click.clicked_at >= today_start,
            )
        )
    )
    clicks_today = today_result.scalar() or 0
    
    # Unique visitors (simplified)
    unique_result = await db.execute(
        select(func.count(func.distinct(Click.visitor_hash)))
        .join(Link)
        .where(Link.user_id == current_user.id)
    )
    unique_visitors = unique_result.scalar() or 0
    
    return OverviewStats(
        total_links=total_links,
        total_clicks=total_clicks,
        clicks_today=clicks_today,
        unique_visitors=unique_visitors,
    )


@router.get("/links/{link_id}/summary", response_model=StatsSummary)
async def get_link_summary(
    link_id: UUID,
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get summary stats for a specific link."""
    service = LinkService(db)
    link = await service.get_link_by_id(link_id, current_user.id)
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "LINK_NOT_FOUND", "message": "Link not found"},
        )
    
    # Build query
    query = select(Click).where(Click.link_id == link_id)
    if from_date:
        query = query.where(Click.clicked_at >= from_date)
    if to_date:
        query = query.where(Click.clicked_at <= to_date)
    
    result = await db.execute(query)
    clicks = result.scalars().all()
    
    total = len(clicks)
    unique = len(set(c.visitor_hash for c in clicks if c.visitor_hash))
    bots = sum(1 for c in clicks if c.is_bot)
    
    # Calculate avg per day
    if clicks:
        first_click = min(c.clicked_at for c in clicks)
        days = max(1, (datetime.now(timezone.utc) - first_click).days)
        avg_per_day = total / days
    else:
        avg_per_day = 0
    
    return StatsSummary(
        total_clicks=total,
        unique_visitors=unique,
        bot_clicks=bots,
        avg_clicks_per_day=round(avg_per_day, 2),
    )


@router.get("/links/{link_id}/timeseries", response_model=list[TimeSeriesPoint])
async def get_link_timeseries(
    link_id: UUID,
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
    interval: str = Query("day"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get timeseries data for a link."""
    service = LinkService(db)
    link = await service.get_link_by_id(link_id, current_user.id)
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "LINK_NOT_FOUND", "message": "Link not found"},
        )
    
    # Default date range
    if not to_date:
        to_date = datetime.now(timezone.utc)
    if not from_date:
        from_date = to_date - timedelta(days=30)
    
    # Query clicks grouped by date
    date_trunc = func.date_trunc(interval, Click.clicked_at)
    result = await db.execute(
        select(
            date_trunc.label("period"),
            func.count(Click.id).label("clicks"),
            func.count(func.distinct(Click.visitor_hash)).label("unique"),
        )
        .where(
            and_(
                Click.link_id == link_id,
                Click.clicked_at >= from_date,
                Click.clicked_at <= to_date,
            )
        )
        .group_by(date_trunc)
        .order_by(date_trunc)
    )
    
    rows = result.all()
    return [
        TimeSeriesPoint(
            date=row.period,
            clicks=row.clicks,
            unique_visitors=row.unique,
        )
        for row in rows
    ]


@router.get("/links/{link_id}/breakdown", response_model=list[BreakdownItem])
async def get_link_breakdown(
    link_id: UUID,
    dimension: str = Query(..., regex="^(country|city|device|os|browser|referrer|utm_source)$"),
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get breakdown stats for a link by dimension."""
    service = LinkService(db)
    link = await service.get_link_by_id(link_id, current_user.id)
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "LINK_NOT_FOUND", "message": "Link not found"},
        )
    
    # Map dimension to column
    dimension_map = {
        "country": Click.country_code,
        "city": Click.city,
        "device": Click.device_type,
        "os": Click.os,
        "browser": Click.browser,
        "referrer": Click.referrer_domain,
        "utm_source": Click.utm_source,
    }
    column = dimension_map.get(dimension)
    if not column:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_DIMENSION", "message": f"Invalid dimension: {dimension}"},
        )
    
    # Build query
    query = select(
        column.label("name"),
        func.count(Click.id).label("count"),
    ).where(
        and_(
            Click.link_id == link_id,
            column.isnot(None),
        )
    )
    
    if from_date:
        query = query.where(Click.clicked_at >= from_date)
    if to_date:
        query = query.where(Click.clicked_at <= to_date)
    
    query = query.group_by(column).order_by(func.count(Click.id).desc()).limit(limit)
    
    result = await db.execute(query)
    rows = result.all()
    
    total = sum(row.count for row in rows) if rows else 1
    
    return [
        BreakdownItem(
            name=row.name or "Unknown",
            count=row.count,
            percentage=round((row.count / total) * 100, 1) if total > 0 else 0,
        )
        for row in rows
    ]
