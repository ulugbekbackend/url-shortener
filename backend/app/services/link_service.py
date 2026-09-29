"""Link service - business logic for links."""
from datetime import datetime, timezone
from typing import Optional, List
from uuid import UUID
import hashlib

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.security import generate_code, hash_password
from app.models.models import Link, Tag, LinkTag
from app.services.url_validator import validate_target_url


class LinkService:
    """Service for link operations."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def create_link(
        self,
        url: str,
        user_id: Optional[UUID] = None,
        custom_code: Optional[str] = None,
        title: Optional[str] = None,
        tags: Optional[List[str]] = None,
        expires_at: Optional[datetime] = None,
        max_clicks: Optional[int] = None,
        password: Optional[str] = None,
        is_permanent: bool = False,
    ) -> Link:
        """Create a new link."""
        validate_target_url(url)
        
        # Generate or validate code
        if custom_code:
            if custom_code.lower() in [r.lower() for r in settings.RESERVED_CODES]:
                raise ValueError(f"Code '{custom_code}' is reserved")
            code = custom_code
            is_custom = True
        else:
            code = await self._generate_unique_code()
            is_custom = False
        
        # Hash password if provided
        password_hash = hash_password(password) if password else None
        
        # Resolve tags up front: lazy-loading link.tags is not allowed in async
        tag_objs = []
        if tags and user_id:
            for tag_name in tags:
                tag_objs.append(await self._get_or_create_tag(user_id, tag_name))
        
        # Create link
        link = Link(
            user_id=user_id,
            code=code,
            is_custom=is_custom,
            original_url=url,
            title=title,
            password_hash=password_hash,
            expires_at=expires_at,
            max_clicks=max_clicks,
            is_permanent=is_permanent,
            tags=tag_objs,
        )
        self.db.add(link)
        await self.db.commit()
        return await self._reload(link.id)
    
    async def _generate_unique_code(self, max_attempts: int = 5) -> str:
        """Generate a unique code with collision retry."""
        for _ in range(max_attempts):
            code = generate_code()
            existing = await self.get_link_by_code(code)
            if not existing:
                return code
        raise RuntimeError("Failed to generate unique code after max attempts")
    
    async def _get_or_create_tag(self, user_id: UUID, name: str) -> Tag:
        """Get existing tag or create new one."""
        result = await self.db.execute(
            select(Tag).where(and_(Tag.user_id == user_id, Tag.name == name))
        )
        tag = result.scalar_one_or_none()
        if not tag:
            tag = Tag(user_id=user_id, name=name)
            self.db.add(tag)
            await self.db.flush()
        return tag
    
    async def get_link_by_code(self, code: str) -> Optional[Link]:
        """Get link by code."""
        result = await self.db.execute(
            select(Link).where(Link.code == code).options(selectinload(Link.tags))
        )
        return result.scalar_one_or_none()
    
    async def get_link_by_id(self, link_id: UUID, user_id: Optional[UUID] = None) -> Optional[Link]:
        """Get link by ID, optionally filtered by user."""
        query = select(Link).where(Link.id == link_id).options(selectinload(Link.tags))
        if user_id:
            query = query.where(Link.user_id == user_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def list_links(
        self,
        user_id: UUID,
        search: Optional[str] = None,
        tag: Optional[str] = None,
        status: Optional[str] = None,
        sort: str = "created",
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[List[Link], int]:
        """List links for a user with filters."""
        query = select(Link).where(Link.user_id == user_id).options(selectinload(Link.tags))
        count_query = select(func.count(Link.id)).where(Link.user_id == user_id)
        
        # Apply filters
        if search:
            search_filter = or_(
                Link.title.ilike(f"%{search}%"),
                Link.original_url.ilike(f"%{search}%"),
                Link.code.ilike(f"%{search}%"),
            )
            query = query.where(search_filter)
            count_query = count_query.where(search_filter)
        
        if tag:
            query = query.where(Link.tags.any(Tag.name == tag))
            count_query = count_query.where(Link.tags.any(Tag.name == tag))
        
        if status == "active":
            query = query.where(Link.is_active == True)
            count_query = count_query.where(Link.is_active == True)
        elif status == "disabled":
            query = query.where(Link.is_active == False)
            count_query = count_query.where(Link.is_active == False)
        
        # Apply sorting
        if sort == "clicks":
            query = query.order_by(Link.total_clicks.desc())
        else:
            query = query.order_by(Link.created_at.desc())
        
        # Apply pagination
        query = query.offset((page - 1) * page_size).limit(page_size)
        
        result = await self.db.execute(query)
        links = result.scalars().all()
        
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0
        
        return list(links), total
    
    async def update_link(
        self,
        link_id: UUID,
        user_id: UUID,
        title: Optional[str] = None,
        tags: Optional[List[str]] = None,
        expires_at: Optional[datetime] = None,
        max_clicks: Optional[int] = None,
        is_active: Optional[bool] = None,
        is_permanent: Optional[bool] = None,
    ) -> Optional[Link]:
        """Update a link."""
        link = await self.get_link_by_id(link_id, user_id)
        if not link:
            return None
        
        if title is not None:
            link.title = title
        if expires_at is not None:
            link.expires_at = expires_at
        if max_clicks is not None:
            link.max_clicks = max_clicks
        if is_active is not None:
            link.is_active = is_active
        if is_permanent is not None:
            link.is_permanent = is_permanent
        
        # Update tags
        if tags is not None:
            link.tags.clear()
            for tag_name in tags:
                tag = await self._get_or_create_tag(user_id, tag_name)
                link.tags.append(tag)
        
        await self.db.commit()
        return await self._reload(link.id)
    
    async def _reload(self, link_id: UUID) -> Link:
        """Re-read a link with tags eagerly loaded (refresh() would expire them)."""
        result = await self.db.execute(
            select(Link)
            .where(Link.id == link_id)
            .options(selectinload(Link.tags))
            .execution_options(populate_existing=True)
        )
        return result.scalar_one()
    
    async def delete_link(self, link_id: UUID, user_id: UUID) -> bool:
        """Delete a link."""
        link = await self.get_link_by_id(link_id, user_id)
        if not link:
            return False
        
        await self.db.delete(link)
        await self.db.commit()
        return True
    
    async def increment_clicks(self, link_id: UUID) -> None:
        """Increment click count for a link."""
        result = await self.db.execute(
            select(Link).where(Link.id == link_id)
        )
        link = result.scalar_one_or_none()
        if link:
            link.total_clicks += 1
            await self.db.commit()
