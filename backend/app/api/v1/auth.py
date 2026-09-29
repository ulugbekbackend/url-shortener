"""Auth API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user
from app.schemas.schemas import UserRegister, UserLogin, UserResponse, TokenResponse
from app.services.auth_service import AuthService
from app.models.models import User


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(data: UserRegister, db: AsyncSession = Depends(get_db)):
    """Register a new user."""
    service = AuthService(db)
    try:
        user = await service.register(data.email, data.password, data.name)
        return user
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "REGISTRATION_FAILED", "message": str(e)},
        )


@router.post("/login", response_model=TokenResponse)
async def login(
    response: Response,
    request: Request,
    data: UserLogin,
    db: AsyncSession = Depends(get_db),
):
    """Login and get access token."""
    service = AuthService(db)
    try:
        user_agent = request.headers.get("user-agent")
        ip = request.client.host if request.client else None
        access_token, refresh_token, user = await service.login(
            data.email, data.password, user_agent, ip
        )
        
        # Set refresh token cookie
        response.set_cookie(
            key="refresh_token",
            value=refresh_token,
            httponly=True,
            secure=True,
            samesite="lax",
            max_age=7 * 24 * 60 * 60,  # 7 days
        )
        
        return TokenResponse(access_token=access_token, user=UserResponse.model_validate(user))
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_CREDENTIALS", "message": str(e)},
        )


@router.post("/refresh", response_model=dict)
async def refresh(
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Refresh access token using refresh token cookie."""
    refresh_token = request.cookies.get("refresh_token")
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
        response.set_cookie(
            key="refresh_token",
            value=new_refresh_token,
            httponly=True,
            secure=True,
            samesite="lax",
            max_age=7 * 24 * 60 * 60,
        )
        
        return {"access_token": access_token, "token_type": "bearer"}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_REFRESH_TOKEN", "message": str(e)},
        )


@router.post("/logout")
async def logout(
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Logout and revoke refresh token."""
    refresh_token = request.cookies.get("refresh_token")
    if refresh_token:
        service = AuthService(db)
        await service.logout(refresh_token)
    
    response.delete_cookie("refresh_token")
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user info."""
    return current_user
