"""Tags endpoints."""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.models import LinkTag, Tag, User
from app.schemas.schemas import TagResponse

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=list[TagResponse])
async def list_tags(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List the user's tags with the number of links using each, most used first."""
    link_count = func.count(LinkTag.link_id)
    rows = (
        await db.execute(
            select(Tag, link_count)
            .outerjoin(LinkTag, LinkTag.tag_id == Tag.id)
            .where(Tag.user_id == current_user.id)
            .group_by(Tag.id)
            .order_by(link_count.desc(), Tag.name)
        )
    ).all()
    return [
        TagResponse(id=tag.id, name=tag.name, created_at=tag.created_at, link_count=count)
        for tag, count in rows
    ]
