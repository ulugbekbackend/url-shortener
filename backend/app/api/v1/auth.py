"""Auth API endpoints."""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.email import email_enabled
from app.core.errors import AppError
from app.core.rate_limit import BRUTE_FORCE_WINDOW, client_ip, enforce, hit
from app.core.security import hash_token
from app.models.models import User
from app.schemas.schemas import (
    AccountDelete,
    ForgotPassword,
    PasswordChange,
    PasswordReset,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
    UserUpdate,
)
from app.services.auth_service import AuthService, send_password_reset_email

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


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(
    data: ForgotPassword,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Email a password reset link. The answer is the same whether the account exists or not."""
    if not email_enabled():
        raise AppError(
            503, "EMAIL_DISABLED", "Password reset by email is not available on this server"
        )
    await enforce(
        f"pwreset:{client_ip(request)}", settings.RATE_LIMIT_PASSWORD_RESET, BRUTE_FORCE_WINDOW
    )
    # Over the per-address limit: quietly send nothing rather than reveal anything
    per_address = await hit(
        f"pwreset-email:{hash_token(data.email.lower())}",
        settings.PASSWORD_RESET_EMAILS_PER_HOUR,
        3600,
    )
    if per_address is None or per_address.allowed:
        issued = await AuthService(db).create_password_reset(data.email)
        if issued:
            user, token = issued
            background_tasks.add_task(send_password_reset_email, user.email, user.name, token)
    return {"message": "If an account exists for this email, a reset link is on its way"}


@router.post("/reset-password")
async def reset_password(
    data: PasswordReset, request: Request, db: AsyncSession = Depends(get_db)
) -> dict[str, str]:
    """Set a new password with the token from the reset email; all sessions are signed out."""
    await enforce(
        f"pwreset-submit:{client_ip(request)}",
        settings.RATE_LIMIT_PASSWORD_RESET,
        BRUTE_FORCE_WINDOW,
    )
    await AuthService(db).reset_password(data.token, data.new_password)
    return {"message": "Your password has been reset, you can sign in now"}
