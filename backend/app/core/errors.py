"""Application errors and uniform JSON error responses.

Every error leaves the API as {"error": {"code": ..., "message": ..., "details"?: ...}}.
"""

from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import ORJSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    """Error raised from services/endpoints with an explicit HTTP status and code."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        self.headers = headers


def error_body(code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    """Build the uniform error payload."""
    error: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    return {"error": error}


def _default_code(status_code: int) -> str:
    try:
        return HTTPStatus(status_code).phrase.upper().replace(" ", "_")
    except ValueError:
        return "ERROR"


def register_error_handlers(app: FastAPI) -> None:
    """Install handlers that convert all errors to the uniform format."""

    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> ORJSONResponse:
        return ORJSONResponse(
            error_body(exc.code, exc.message, exc.details),
            status_code=exc.status_code,
            headers=exc.headers,
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(request: Request, exc: StarletteHTTPException) -> ORJSONResponse:
        if isinstance(exc.detail, dict) and "code" in exc.detail:
            body = {"error": exc.detail}
        else:
            body = error_body(_default_code(exc.status_code), str(exc.detail))
        return ORJSONResponse(body, status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> ORJSONResponse:
        errors = jsonable_encoder(exc.errors())
        message = errors[0]["msg"] if errors else "Invalid request"
        return ORJSONResponse(
            error_body("VALIDATION_ERROR", message, {"errors": errors}), status_code=422
        )
