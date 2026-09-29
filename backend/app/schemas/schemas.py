"""Pydantic schemas for request/response validation."""
from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, EmailStr, HttpUrl, Field, field_validator
import re


# Auth schemas
class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=100)
    name: str = Field(min_length=1, max_length=100)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: UUID
    email: str
    name: str
    plan: str
    created_at: datetime
    
    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=100)


class AccountDelete(BaseModel):
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# Link schemas
class LinkCreate(BaseModel):
    url: str = Field(max_length=2048)
    custom_code: Optional[str] = Field(None, min_length=3, max_length=50)
    title: Optional[str] = Field(None, max_length=200)
    tags: Optional[List[str]] = None
    expires_at: Optional[datetime] = None
    max_clicks: Optional[int] = Field(None, gt=0)
    password: Optional[str] = Field(None, min_length=4, max_length=100)
    is_permanent: bool = False
    
    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v
    
    @field_validator("custom_code")
    @classmethod
    def validate_custom_code(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not re.match(r"^[A-Za-z0-9_-]+$", v):
            raise ValueError("Custom code must contain only letters, numbers, hyphens, and underscores")
        return v


class LinkAnonymous(BaseModel):
    url: str = Field(max_length=2048)
    
    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v


class LinkUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    tags: Optional[List[str]] = None
    expires_at: Optional[datetime] = None
    max_clicks: Optional[int] = Field(None, gt=0)
    is_active: Optional[bool] = None
    is_permanent: Optional[bool] = None


class LinkResponse(BaseModel):
    id: UUID
    code: str
    original_url: str
    short_url: str
    title: Optional[str]
    favicon_url: Optional[str]
    tags: List[str]
    total_clicks: int
    is_active: bool
    is_permanent: bool
    is_custom: bool
    expires_at: Optional[datetime]
    max_clicks: Optional[int]
    has_password: bool
    created_at: datetime
    updated_at: datetime
    
    model_config = {"from_attributes": True}


class LinkListResponse(BaseModel):
    items: List[LinkResponse]
    total: int
    page: int
    page_size: int


# Analytics schemas
class StatsSummary(BaseModel):
    total_clicks: int
    unique_visitors: int
    bot_clicks: int
    avg_clicks_per_day: float


class TimeSeriesPoint(BaseModel):
    date: datetime
    clicks: int
    unique_visitors: int


class BreakdownItem(BaseModel):
    name: str
    count: int
    percentage: float


class OverviewStats(BaseModel):
    total_links: int
    total_clicks: int
    clicks_today: int
    unique_visitors: int


# API Key schemas
class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class ApiKeyResponse(BaseModel):
    id: UUID
    name: str
    prefix: str
    last_used_at: Optional[datetime]
    created_at: datetime
    revoked_at: Optional[datetime]
    
    model_config = {"from_attributes": True}


class ApiKeyCreatedResponse(BaseModel):
    key: ApiKeyResponse
    full_key: str


# Tag schemas
class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)


class TagResponse(BaseModel):
    id: UUID
    name: str
    created_at: datetime
    link_count: int = 0
    
    model_config = {"from_attributes": True}


# Password unlock
class PasswordUnlock(BaseModel):
    password: str


# Error response
class ErrorResponse(BaseModel):
    error: dict


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Optional[dict] = None
