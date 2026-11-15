from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import router as api_v1_router
from app.core.config import get_settings
from app.core.database import get_db_session
from app.core.timezone import TIMEZONE_HEADER, set_request_timezone


settings = get_settings()

LAN_ORIGIN_REGEX = (
    r"^http://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}"
    r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):4200$"
)

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    # In development also accept the dev server opened by LAN address (testing from a phone).
    allow_origin_regex=LAN_ORIGIN_REGEX
    if settings.environment == "development"
    else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def timezone_middleware(request: Request, call_next):
    set_request_timezone(request.headers.get(TIMEZONE_HEADER))
    return await call_next(request)


@app.get("/", tags=["System"])
async def root() -> dict[str, str]:
    return {
        "message": f"{settings.app_name} is running",
        "environment": settings.environment,
    }


@app.get("/health", tags=["System"])
async def health_check(
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    await session.execute(text("SELECT 1"))

    return {
        "status": "ok",
        "database": "connected",
    }


app.include_router(
    api_v1_router,
    prefix="/api/v1",
)
