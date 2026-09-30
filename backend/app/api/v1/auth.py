"""Auth API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limit import BRUTE_FORCE_WINDOW, client_ip, enforce
from app.models.models import User
from app.schemas.schemas import (
    AccountDelete,
    PasswordChange,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
    UserUpdate,
)
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"
# Browser sends the cookie only to auth endpoints, never to the rest of the API
REFRESH_COOKIE_PATH = "/api/v1/auth"


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path=REFRESH_COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        REFRESH_COOKIE,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
    )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(data: UserRegister, db: AsyncSession = Depends(get_db)) -> UserResponse:
    """Register a new user."""
    service = AuthService(db)
    try:
        user = await service.register(data.email, data.password, data.name)
        return UserResponse.model_validate(user)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "REGISTRATION_FAILED", "message": str(e)},
        ) from e


@router.post("/login", response_model=TokenResponse)
async def login(
    response: Response,
    request: Request,
    data: UserLogin,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Login and get access token."""
    await enforce(f"login:{client_ip(request)}", settings.RATE_LIMIT_LOGIN, BRUTE_FORCE_WINDOW)
    service = AuthService(db)
    try:
        user_agent = request.headers.get("user-agent")
        ip = request.client.host if request.client else None
        access_token, refresh_token, user = await service.login(
            data.email, data.password, user_agent, ip
        )

        # Set refresh token cookie
        _set_refresh_cookie(response, refresh_token)

        return TokenResponse(access_token=access_token, user=UserResponse.model_validate(user))
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_CREDENTIALS", "message": str(e)},
        ) from e


@router.post("/refresh", response_model=dict)
async def refresh(
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Refresh access token using refresh token cookie."""
    refresh_token = request.cookies.get(REFRESH_COOKIE)
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "NO_REFRESH_TOKEN", "message": "Refresh token not found"},
        )

    service = AuthService(db)
    try:
        user_agent = request.headers.get("user-agent")
        ip = request.client.host if request.client else None
        access_token, new_refresh_token = await service.refresh(refresh_token, user_agent, ip)

        # Set new refresh token cookie
        _set_refresh_cookie(response, new_refresh_token)

        return {"access_token": access_token, "token_type": "bearer"}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_REFRESH_TOKEN", "message": str(e)},
        ) from e


@router.post("/logout")
async def logout(
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Logout and revoke refresh token."""
    refresh_token = request.cookies.get(REFRESH_COOKIE)
    if refresh_token:
        service = AuthService(db)
        await service.logout(refresh_token)

    _clear_refresh_cookie(response)
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)) -> UserResponse:
    """Get current user info."""
    return UserResponse.model_validate(current_user)


@router.patch("/me", response_model=UserResponse)
async def update_me(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Update the current user's name and/or email."""
    user = await AuthService(db).update_profile(current_user, data.name, data.email)
    return UserResponse.model_validate(user)


@router.post("/change-password", response_model=TokenResponse)
async def change_password(
    data: PasswordChange,
    response: Response,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Change password; other sessions are signed out, this one gets new tokens."""
    access_token, refresh_token = await AuthService(db).change_password(
        current_user,
        data.current_password,
        data.new_password,
        request.headers.get("user-agent"),
        request.client.host if request.client else None,
    )
    _set_refresh_cookie(response, refresh_token)
    return TokenResponse(access_token=access_token, user=UserResponse.model_validate(current_user))


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    data: AccountDelete,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Permanently delete the account and all its data (password required)."""
    await AuthService(db).delete_account(current_user, data.password)
    _clear_refresh_cookie(response)
