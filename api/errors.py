import logging

from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


# ── Base ─────────────────────────────────────────────────────────────────────


class AppError(Exception):
    """Base class for all application-level errors."""

    status_code: int = 500
    default_message: str = "An unexpected error occurred"

    def __init__(self, message: str | None = None) -> None:
        self.message = message or self.default_message
        super().__init__(self.message)


# ── Image / vision errors ─────────────────────────────────────────────────────


class ImageDecodeError(AppError):
    status_code = 400
    default_message = "Could not decode the provided image"


class ModelNotReadyError(AppError):
    status_code = 503
    default_message = (
        "Face recognition model is not available. "
        "The server may still be loading or the model failed to initialise."
    )


class EmbeddingError(AppError):
    status_code = 422
    default_message = "Could not extract face embedding from the image"


# ── Database errors ───────────────────────────────────────────────────────────


class DatabaseError(AppError):
    status_code = 500
    default_message = "A database error occurred"


# ── FastAPI exception handlers ────────────────────────────────────────────────


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Handler for all known AppError subclasses."""
    logger.warning(
        "AppError [%s] on %s: %s",
        type(exc).__name__,
        request.url.path,
        exc.message,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.message,
            "type": type(exc).__name__,
        },
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all handler so unhandled exceptions never expose stack traces."""
    logger.exception(
        "Unhandled exception on %s: %s",
        request.url.path,
        exc,
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "type": "InternalError",
        },
    )
