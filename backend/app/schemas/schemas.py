"""Pydantic schemas for request/response validation."""

import re
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator


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
    name: str | None = Field(None, min_length=1, max_length=100)
    email: EmailStr | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=100)


class AccountDelete(BaseModel):
    password: str


class ForgotPassword(BaseModel):
    email: EmailStr


class PasswordReset(BaseModel):
    token: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=8, max_length=100)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# Link schemas
MAX_TAGS = 20
MAX_TAG_LENGTH = 50  # matches tags.name column


def _clean_tags(tags: list[str] | None) -> list[str] | None:
    """Strip, drop empties and duplicates, enforce count and length limits."""
    if tags is None:
        return None
    cleaned = list(dict.fromkeys(t.strip() for t in tags if t.strip()))
    if len(cleaned) > MAX_TAGS:
        raise ValueError(f"At most {MAX_TAGS} tags are allowed")
    for tag in cleaned:
        if len(tag) > MAX_TAG_LENGTH:
            raise ValueError(f"Tag '{tag[:20]}...' is longer than {MAX_TAG_LENGTH} characters")
    return cleaned


class LinkCreate(BaseModel):
    url: str = Field(max_length=2048)
    custom_code: str | None = Field(None, min_length=3, max_length=50)
    title: str | None = Field(None, max_length=200)
    tags: list[str] | None = None
    expires_at: datetime | None = None
    max_clicks: int | None = Field(None, gt=0)
    password: str | None = Field(None, min_length=4, max_length=100)
    is_permanent: bool = False

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: list[str] | None) -> list[str] | None:
        return _clean_tags(v)

    @field_validator("custom_code")
    @classmethod
    def validate_custom_code(cls, v: str | None) -> str | None:
        if v is not None and not re.match(r"^[A-Za-z0-9_-]+$", v):
            raise ValueError(
                "Custom code must contain only letters, numbers, hyphens, and underscores"
            )
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
    title: str | None = Field(None, max_length=200)
    tags: list[str] | None = None
    expires_at: datetime | None = None
    max_clicks: int | None = Field(None, gt=0)
    is_active: bool | None = None
    is_permanent: bool | None = None

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: list[str] | None) -> list[str] | None:
        return _clean_tags(v)


class LinkResponse(BaseModel):
    id: UUID
    code: str
    original_url: str
    short_url: str
    title: str | None
    favicon_url: str | None
    tags: list[str]
    total_clicks: int
    is_active: bool
    is_permanent: bool
    is_custom: bool
    expires_at: datetime | None
    max_clicks: int | None
    has_password: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BulkRowResult(BaseModel):
    row: int
    url: str
    status: Literal["success", "error"]
    code: str | None = None
    short_url: str | None = None
    error: str | None = None


class BulkImportResponse(BaseModel):
    created: int
    failed: int
    results: list[BulkRowResult]


class LinkListResponse(BaseModel):
    items: list[LinkResponse]
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
    last_used_at: datetime | None
    created_at: datetime
    revoked_at: datetime | None

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
    error: dict[str, Any]


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict[str, Any] | None = None
