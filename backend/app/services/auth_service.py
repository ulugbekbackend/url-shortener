"""Auth service - business logic for authentication."""
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import AppError
from app.core.redis import get_redis
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_token,
)
from app.models.models import Link, RefreshToken, User
from app.services.link_service import click_counter_key, link_cache_key


def _email_taken() -> AppError:
    return AppError(409, "EMAIL_TAKEN", "User with this email already exists")


class AuthService:
    """Service for authentication operations."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def register(self, email: str, password: str, name: str) -> User:
        """Register a new user."""
        # Check if user exists
        existing = await self.get_user_by_email(email)
        if existing:
            raise ValueError("User with this email already exists")
        
        # Create user
        user = User(
            email=email,
            password_hash=hash_password(password),
            name=name,
        )
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user
    
    async def login(self, email: str, password: str, user_agent: Optional[str] = None, ip: Optional[str] = None) -> tuple[str, str, User]:
        """Login a user and return (access_token, refresh_token, user)."""
        user = await self.get_user_by_email(email)
        if not user or not verify_password(password, user.password_hash):
            raise ValueError("Invalid email or password")
        
        access_token, refresh_token = self._issue_tokens(user.id, user_agent, ip)
        await self.db.commit()

        return access_token, refresh_token, user

    def _issue_tokens(
        self, user_id: UUID, user_agent: Optional[str], ip: Optional[str]
    ) -> tuple[str, str]:
        """Create an access/refresh pair and stage the refresh token for storage."""
        access_token = create_access_token({"sub": str(user_id)})
        refresh_token, token_hash = create_refresh_token({"sub": str(user_id)})
        expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        self.db.add(
            RefreshToken(
                user_id=user_id,
                token_hash=token_hash,
                expires_at=expires_at,
                user_agent=user_agent,
                ip_address=ip,
            )
        )
        return access_token, refresh_token

    async def update_profile(
        self, user: User, name: Optional[str], email: Optional[str]
    ) -> User:
        """Change name and/or email; email must stay unique."""
        if name is not None:
            user.name = name
        if email is not None and email != user.email:
            if await self.get_user_by_email(email):
                raise _email_taken()
            user.email = email
        try:
            await self.db.commit()
        except IntegrityError:
            await self.db.rollback()
            raise _email_taken()
        await self.db.refresh(user)
        return user

    async def change_password(
        self,
        user: User,
        current_password: str,
        new_password: str,
        user_agent: Optional[str] = None,
        ip: Optional[str] = None,
    ) -> tuple[str, str]:
        """Set a new password, end every other session and return a fresh token pair."""
        if not verify_password(current_password, user.password_hash):
            raise AppError(400, "INVALID_PASSWORD", "Current password is incorrect")
        user.password_hash = hash_password(new_password)
        await self._revoke_all_user_tokens(user.id)
        access_token, refresh_token = self._issue_tokens(user.id, user_agent, ip)
        await self.db.commit()
        return access_token, refresh_token

    async def delete_account(self, user: User, password: str) -> None:
        """Delete the user with all links, clicks, tags, keys and sessions."""
        if not verify_password(password, user.password_hash):
            raise AppError(400, "INVALID_PASSWORD", "Password is incorrect")
        links = (
            await self.db.execute(select(Link.id, Link.code).where(Link.user_id == user.id))
        ).all()
        # Bulk deletes let DB cascades remove clicks/tags instead of loading them into the ORM
        await self.db.execute(delete(Link).where(Link.user_id == user.id))
        await self.db.execute(delete(User).where(User.id == user.id))
        await self.db.commit()
        if links:
            redis = await get_redis()
            keys = [link_cache_key(code) for _, code in links]
            keys += [click_counter_key(link_id) for link_id, _ in links]
            await redis.delete(*keys)
    
    async def refresh(self, refresh_token: str, user_agent: Optional[str] = None, ip: Optional[str] = None) -> tuple[str, str]:
        """Refresh access token and rotate refresh token."""
        # Decode token
        payload = decode_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            raise ValueError("Invalid refresh token")
        
        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("Invalid refresh token")
        
        # Check if token exists and is not revoked
        token_hash = hash_token(refresh_token)
        result = await self.db.execute(
            select(RefreshToken).where(
                and_(
                    RefreshToken.token_hash == token_hash,
                    RefreshToken.revoked_at.is_(None),
                    RefreshToken.expires_at > datetime.now(timezone.utc),
                )
            )
        )
        stored_token = result.scalar_one_or_none()
        
        if not stored_token:
            # Token reuse detected - revoke all tokens for this user
            await self._revoke_all_user_tokens(UUID(user_id))
            raise ValueError("Refresh token reuse detected - all sessions revoked")
        
        # Revoke old token
        stored_token.revoked_at = datetime.now(timezone.utc)
        
        # Create new tokens
        access_token = create_access_token({"sub": user_id})
        new_refresh_token, new_token_hash = create_refresh_token({"sub": user_id})
        
        # Store new refresh token
        expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        new_token_obj = RefreshToken(
            user_id=UUID(user_id),
            token_hash=new_token_hash,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip,
        )
        self.db.add(new_token_obj)
        await self.db.commit()
        
        return access_token, new_refresh_token
    
    async def logout(self, refresh_token: str) -> None:
        """Logout by revoking refresh token."""
        token_hash = hash_token(refresh_token)
        result = await self.db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        stored_token = result.scalar_one_or_none()
        if stored_token:
            stored_token.revoked_at = datetime.now(timezone.utc)
            await self.db.commit()
    
    async def get_user_by_id(self, user_id: UUID) -> Optional[User]:
        """Get user by ID."""
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()
    
    async def get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email."""
        result = await self.db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()
    
    async def _revoke_all_user_tokens(self, user_id: UUID) -> None:
        """Revoke all refresh tokens for a user."""
        result = await self.db.execute(
            select(RefreshToken).where(
                and_(
                    RefreshToken.user_id == user_id,
                    RefreshToken.revoked_at.is_(None),
                )
            )
        )
        tokens = result.scalars().all()
        for token in tokens:
            token.revoked_at = datetime.now(timezone.utc)
        await self.db.commit()
