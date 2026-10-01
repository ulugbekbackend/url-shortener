"""Auth service - business logic for authentication."""

import logging
import secrets
from datetime import UTC, datetime, timedelta
from html import escape
from uuid import UUID

from sqlalchemy import and_, delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.email import send_email
from app.core.errors import AppError
from app.core.redis import get_redis
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.models.models import Link, PasswordResetToken, RefreshToken, User
from app.services.link_service import click_counter_key, link_cache_key

log = logging.getLogger(__name__)


def _email_taken() -> AppError:
    return AppError(409, "EMAIL_TAKEN", "User with this email already exists")


def password_reset_url(token: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"


async def send_password_reset_email(email: str, name: str, token: str) -> None:
    """Email the reset link; runs after the response, so failures are only logged."""
    url = password_reset_url(token)
    minutes = settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES
    text = (
        f"Hi {name},\n\n"
        f"Someone asked to reset the password for your {settings.APP_NAME} account.\n"
        f"Open this link to choose a new one (valid for {minutes} minutes):\n\n{url}\n\n"
        "If it wasn't you, ignore this email: your password stays the same.\n"
    )
    html = (
        f"<p>Hi {escape(name)},</p>"
        f"<p>Someone asked to reset the password for your {escape(settings.APP_NAME)} account.</p>"
        f'<p><a href="{escape(url)}">Choose a new password</a> (valid for {minutes} minutes)</p>'
        "<p>If it wasn't you, ignore this email: your password stays the same.</p>"
    )
    try:
        await send_email(email, f"Reset your {settings.APP_NAME} password", text, html)
    except Exception:
        log.exception("Could not send the password reset email")


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

    async def login(
        self, email: str, password: str, user_agent: str | None = None, ip: str | None = None
    ) -> tuple[str, str, User]:
        """Login a user and return (access_token, refresh_token, user)."""
        user = await self.get_user_by_email(email)
        if not user or not verify_password(password, user.password_hash):
            raise ValueError("Invalid email or password")

        access_token, refresh_token = self._issue_tokens(user.id, user_agent, ip)
        await self.db.commit()

        return access_token, refresh_token, user

    def _issue_tokens(
        self, user_id: UUID, user_agent: str | None, ip: str | None
    ) -> tuple[str, str]:
        """Create an access/refresh pair and stage the refresh token for storage."""
        access_token = create_access_token({"sub": str(user_id)})
        refresh_token, token_hash = create_refresh_token({"sub": str(user_id)})
        expires_at = datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
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

    async def update_profile(self, user: User, name: str | None, email: str | None) -> User:
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
            raise _email_taken() from None
        await self.db.refresh(user)
        return user

    async def change_password(
        self,
        user: User,
        current_password: str,
        new_password: str,
        user_agent: str | None = None,
        ip: str | None = None,
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

    async def create_password_reset(self, email: str) -> tuple[User, str] | None:
        """Issue a reset token for the account, replacing older ones; None if no such user."""
        user = await self.get_user_by_email(email)
        if user is None:
            return None
        await self.db.execute(
            delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id)
        )
        token = secrets.token_urlsafe(32)
        expires = timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES)
        self.db.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=hash_token(token),
                expires_at=datetime.now(UTC) + expires,
            )
        )
        await self.db.commit()
        return user, token

    async def reset_password(self, token: str, new_password: str) -> None:
        """Set a new password from a valid reset token and sign out every session."""
        # Locked, so two submissions of the same link can't both succeed
        stored = await self.db.scalar(
            select(PasswordResetToken)
            .where(
                PasswordResetToken.token_hash == hash_token(token),
                PasswordResetToken.used_at.is_(None),
                PasswordResetToken.expires_at > datetime.now(UTC),
            )
            .with_for_update()
        )
        user = await self.get_user_by_id(stored.user_id) if stored else None
        if stored is None or user is None:
            raise AppError(400, "INVALID_RESET_TOKEN", "This reset link is invalid or has expired")
        stored.used_at = datetime.now(UTC)
        user.password_hash = hash_password(new_password)
        await self._revoke_all_user_tokens(user.id)  # commits the changes above too

    async def refresh(
        self, refresh_token: str, user_agent: str | None = None, ip: str | None = None
    ) -> tuple[str, str]:
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
                    RefreshToken.expires_at > datetime.now(UTC),
                )
            )
        )
        stored_token = result.scalar_one_or_none()

        if not stored_token:
            # Token reuse detected - revoke all tokens for this user
            await self._revoke_all_user_tokens(UUID(user_id))
            raise ValueError("Refresh token reuse detected - all sessions revoked")

        # Revoke old token
        stored_token.revoked_at = datetime.now(UTC)

        # Create new tokens
        access_token = create_access_token({"sub": user_id})
        new_refresh_token, new_token_hash = create_refresh_token({"sub": user_id})

        # Store new refresh token
        expires_at = datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
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
            stored_token.revoked_at = datetime.now(UTC)
            await self.db.commit()

    async def get_user_by_id(self, user_id: UUID) -> User | None:
        """Get user by ID."""
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_user_by_email(self, email: str) -> User | None:
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
            token.revoked_at = datetime.now(UTC)
        await self.db.commit()
