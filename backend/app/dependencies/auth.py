import uuid
from dataclasses import dataclass

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    id: uuid.UUID
    email: str | None
    username: str | None
    # Sign-in methods linked to the account, e.g. ("email",), ("google",), ("email", "google").
    providers: tuple[str, ...] = ()


def current_user_from_supabase(user_data: dict) -> CurrentUser:
    user_metadata = user_data.get("user_metadata") or {}
    app_metadata = user_data.get("app_metadata") or {}

    # Our own sign-up sets display_name; Google sends full_name / name instead.
    username = (
        user_metadata.get("display_name")
        or user_metadata.get("full_name")
        or user_metadata.get("name")
    )

    return CurrentUser(
        id=uuid.UUID(user_data["id"]),
        email=user_data.get("email"),
        username=username,
        providers=tuple(app_metadata.get("providers") or ()),
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    settings = get_settings()

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{str(settings.supabase_url).rstrip('/')}/auth/v1/user",
                headers={
                    "apikey": settings.supabase_api_key,
                    "Authorization": f"Bearer {credentials.credentials}",
                },
            )
    except httpx.RequestError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is temporarily unavailable",
        ) from error

    if response.status_code != status.HTTP_200_OK:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        return current_user_from_supabase(response.json())
    except (KeyError, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user returned by authentication service",
        ) from error
