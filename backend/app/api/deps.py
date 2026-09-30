"""API dependencies."""
from datetime import UTC
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token, hash_token
from app.models.models import ApiKey, User

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Get current authenticated user from JWT token."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "NOT_AUTHENTICATED", "message": "Not authenticated"},
        )
    
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_TOKEN", "message": "Invalid or expired token"},
        )
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_TOKEN", "message": "Invalid token payload"},
        )
    
    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "USER_NOT_FOUND", "message": "User not found"},
        )
    
    return user


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Get current user if authenticated, None otherwise."""
    if not credentials:
        return None
    
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        return None
    
    user_id = payload.get("sub")
    if not user_id:
        return None
    
    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    return result.scalar_one_or_none()


async def get_api_key(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Get user from API key if provided."""
    api_key = request.headers.get("X-API-Key")
    if not api_key:
        return None
    
    key_hash = hash_token(api_key)
    result = await db.execute(
        select(ApiKey).where(
            and_(
                ApiKey.key_hash == key_hash,
                ApiKey.revoked_at.is_(None),
            )
        )
    )
    key_obj = result.scalar_one_or_none()
    
    if not key_obj:
        return None
    
    # Update last used
    from datetime import datetime
    key_obj.last_used_at = datetime.now(UTC)
    await db.commit()
    
    result = await db.execute(select(User).where(User.id == key_obj.user_id))
    return result.scalar_one_or_none()


async def get_current_user_or_api_key(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Get user from JWT or API key."""
    # Try JWT first
    if credentials:
        payload = decode_token(credentials.credentials)
        if payload and payload.get("type") == "access":
            user_id = payload.get("sub")
            if user_id:
                result = await db.execute(select(User).where(User.id == UUID(user_id)))
                user = result.scalar_one_or_none()
                if user:
                    return user
    
    # Try API key
    api_key = request.headers.get("X-API-Key") if request else None
    if api_key:
        key_hash = hash_token(api_key)
        result = await db.execute(
            select(ApiKey).where(
                and_(
                    ApiKey.key_hash == key_hash,
                    ApiKey.revoked_at.is_(None),
                )
            )
        )
        key_obj = result.scalar_one_or_none()
        if key_obj:
            from datetime import datetime
            key_obj.last_used_at = datetime.now(UTC)
            await db.commit()
            
            result = await db.execute(select(User).where(User.id == key_obj.user_id))
            user = result.scalar_one_or_none()
            if user:
                return user
    
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "NOT_AUTHENTICATED", "message": "Authentication required"},
    )
