"""Links API endpoints."""
import io
from typing import Literal, Optional
from uuid import UUID

import segno

from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user_or_api_key
from app.schemas.schemas import (
    BulkImportResponse, LinkCreate, LinkAnonymous, LinkUpdate, LinkResponse, LinkListResponse
)
from app.services.bulk_service import MAX_FILE_BYTES, export_csv, import_links, parse_csv
from app.services.link_service import LinkService, short_url
from app.models.models import User, Link


router = APIRouter(prefix="/links", tags=["links"])


def link_to_response(link: Link) -> LinkResponse:
    """Convert Link model to response schema."""
    return LinkResponse(
        id=link.id,
        code=link.code,
        original_url=link.original_url,
        short_url=short_url(link.code),
        title=link.title,
        favicon_url=link.favicon_url,
        tags=[tag.name for tag in link.tags] if link.tags else [],
        total_clicks=link.total_clicks,
        is_active=link.is_active,
        is_permanent=link.is_permanent,
        is_custom=link.is_custom,
        expires_at=link.expires_at,
        max_clicks=link.max_clicks,
        has_password=link.password_hash is not None,
        created_at=link.created_at,
        updated_at=link.updated_at,
    )


@router.post("", response_model=LinkResponse, status_code=status.HTTP_201_CREATED)
async def create_link(
    data: LinkCreate,
    current_user: User = Depends(get_current_user_or_api_key),
    db: AsyncSession = Depends(get_db),
):
    """Create a new link (authenticated)."""
    service = LinkService(db)
    try:
        link = await service.create_link(
            url=data.url,
            user_id=current_user.id,
            custom_code=data.custom_code,
            title=data.title,
            tags=data.tags,
            expires_at=data.expires_at,
            max_clicks=data.max_clicks,
            password=data.password,
            is_permanent=data.is_permanent,
        )
        return link_to_response(link)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_INPUT", "message": str(e)},
        ) from e


@router.post("/anonymous", response_model=LinkResponse, status_code=status.HTTP_201_CREATED)
async def create_link_anonymous(
    data: LinkAnonymous,
    db: AsyncSession = Depends(get_db),
):
    """Create a new link anonymously (rate limited)."""
    service = LinkService(db)
    try:
        link = await service.create_link(
            url=data.url,
            user_id=None,
        )
        return link_to_response(link)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_INPUT", "message": str(e)},
        ) from e


@router.get("", response_model=LinkListResponse)
async def list_links(
    search: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    sort: str = Query("created"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user_or_api_key),
    db: AsyncSession = Depends(get_db),
):
    """List user's links with filters."""
    service = LinkService(db)
    links, total = await service.list_links(
        user_id=current_user.id,
        search=search,
        tag=tag,
        status=status_filter,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    
    return LinkListResponse(
        items=[link_to_response(link) for link in links],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/bulk", response_model=BulkImportResponse)
async def bulk_create_links(
    file: UploadFile = File(..., description="CSV with columns url, title, tags, custom_code"),
    current_user: User = Depends(get_current_user_or_api_key),
    db: AsyncSession = Depends(get_db),
):
    """Create up to 500 links from a CSV file; invalid rows are reported, not fatal."""
    rows = parse_csv(await file.read(MAX_FILE_BYTES + 1))
    results = await import_links(LinkService(db), current_user.id, rows)
    created = sum(1 for r in results if r.status == "success")
    return BulkImportResponse(created=created, failed=len(results) - created, results=results)


@router.get("/export")
async def export_links(
    current_user: User = Depends(get_current_user_or_api_key),
    db: AsyncSession = Depends(get_db),
):
    """Download all of the user's links as CSV."""
    links = await LinkService(db).all_links(current_user.id)
    return Response(
        export_csv(links),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="links.csv"'},
    )


# Keep static paths (/bulk, /export) above /{link_id} so they are matched first
@router.get("/{link_id}", response_model=LinkResponse)
async def get_link(
    link_id: UUID,
    current_user: User = Depends(get_current_user_or_api_key),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific link."""
    service = LinkService(db)
    link = await service.get_link_by_id(link_id, current_user.id)
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "LINK_NOT_FOUND", "message": "Link not found"},
        )
    return link_to_response(link)


@router.patch("/{link_id}", response_model=LinkResponse)
async def update_link(
    link_id: UUID,
    data: LinkUpdate,
    current_user: User = Depends(get_current_user_or_api_key),
    db: AsyncSession = Depends(get_db),
):
    """Update a link."""
    service = LinkService(db)
    link = await service.update_link(
        link_id=link_id,
        user_id=current_user.id,
        changes=data.model_dump(exclude_unset=True),
    )
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "LINK_NOT_FOUND", "message": "Link not found"},
        )
    return link_to_response(link)


@router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_link(
    link_id: UUID,
    current_user: User = Depends(get_current_user_or_api_key),
    db: AsyncSession = Depends(get_db),
):
    """Delete a link."""
    service = LinkService(db)
    deleted = await service.delete_link(link_id, current_user.id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "LINK_NOT_FOUND", "message": "Link not found"},
        )

QR_COLOR = r"^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|transparent)$"
QR_MEDIA_TYPES = {"png": "image/png", "svg": "image/svg+xml"}


@router.get(
    "/{link_id}/qr",
    response_class=Response,
    responses={200: {"content": {"image/png": {}, "image/svg+xml": {}}}},
)
async def get_link_qr(
    link_id: UUID,
    fmt: Literal["png", "svg"] = Query("png", alias="format"),
    scale: int = Query(10, ge=1, le=40, description="Pixels per QR module"),
    border: int = Query(4, ge=0, le=20, description="Quiet zone in modules"),
    dark: str = Query("#000000", pattern=QR_COLOR),
    light: str = Query("#ffffff", pattern=QR_COLOR),
    current_user: User = Depends(get_current_user_or_api_key),
    db: AsyncSession = Depends(get_db),
):
    """QR code of the link's short URL as PNG or SVG."""
    link = await LinkService(db).get_link_by_id(link_id, current_user.id)
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "LINK_NOT_FOUND", "message": "Link not found"},
        )

    qr = segno.make(short_url(link.code), error="m")
    buffer = io.BytesIO()
    qr.save(
        buffer,
        kind=fmt,
        scale=scale,
        border=border,
        dark=None if dark == "transparent" else dark,
        light=None if light == "transparent" else light,
    )
    return Response(
        buffer.getvalue(),
        media_type=QR_MEDIA_TYPES[fmt],
        headers={"Content-Disposition": f'inline; filename="qr-{link.code}.{fmt}"'},
    )
