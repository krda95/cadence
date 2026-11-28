from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from pydantic import ValidationError

from app.core.config import get_settings
from app.dependencies.auth import CurrentUser, get_current_user
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    MessageResponse,
    RefreshTokenRequest,
    RegisterRequest,
    RegisterResponse,
    ResetPasswordRequest,
)

router = APIRouter(
    prefix="/auth",
    tags=["Auth"],
)


async def _password_grant(email: str, password: str) -> httpx.Response:
    settings = get_settings()

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            return await client.post(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/token",
                params={
                    "grant_type": "password",
                },
                headers={
                    "apikey": settings.supabase_api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "email": email,
                    "password": password,
                },
            )
    except httpx.RequestError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is temporarily unavailable",
        ) from error


async def _update_password(access_token: str, password: str) -> httpx.Response:
    settings = get_settings()

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            return await client.put(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
                headers={
                    "apikey": settings.supabase_api_key,
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                json={
                    "password": password,
                },
            )
    except httpx.RequestError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is temporarily unavailable",
        ) from error


@router.get("/oauth/google", status_code=status.HTTP_307_TEMPORARY_REDIRECT)
async def start_google_oauth() -> RedirectResponse:
    settings = get_settings()

    query = urlencode(
        {
            "provider": "google",
            "redirect_to": f"{settings.frontend_url.rstrip('/')}/auth/callback",
        }
    )

    return RedirectResponse(
        f"{settings.supabase_url.rstrip('/')}/auth/v1/authorize?{query}"
    )


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest) -> LoginResponse:
    response = await _password_grant(str(payload.email), payload.password)

    if response.status_code in {
        status.HTTP_400_BAD_REQUEST,
        status.HTTP_401_UNAUTHORIZED,
    }:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if response.status_code != status.HTTP_200_OK:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Authentication service returned an unexpected response",
        )

    try:
        return LoginResponse.model_validate(response.json())
    except (ValueError, ValidationError) as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Authentication service returned an invalid response",
        ) from error


@router.post(
    "/refresh",
    response_model=LoginResponse,
)
async def refresh_session(
    payload: RefreshTokenRequest,
) -> LoginResponse:
    settings = get_settings()

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{str(settings.supabase_url).rstrip('/')}/auth/v1/token",
                params={
                    "grant_type": "refresh_token",
                },
                headers={
                    "apikey": settings.supabase_api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "refresh_token": payload.refresh_token,
                },
            )

    except httpx.RequestError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is temporarily unavailable",
        ) from error

    if response.status_code in {
        status.HTTP_400_BAD_REQUEST,
        status.HTTP_401_UNAUTHORIZED,
        status.HTTP_403_FORBIDDEN,
    }:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is invalid or expired",
        )

    if response.status_code != status.HTTP_200_OK:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to refresh session",
        )

    try:
        return LoginResponse.model_validate(response.json())

    except (ValueError, ValidationError) as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Authentication service returned an invalid response",
        ) from error


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(payload: RegisterRequest) -> RegisterResponse:
    settings = get_settings()

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/signup",
                headers={
                    "apikey": settings.supabase_api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "email": str(payload.email),
                    "password": payload.password,
                    "data": {
                        "display_name": payload.username,
                    },
                },
            )
    except httpx.RequestError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is temporarily unavailable",
        ) from error

    if response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid registration data",
        )

    if response.status_code not in {
        status.HTTP_200_OK,
        status.HTTP_201_CREATED,
    }:
        error_data = response.json()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_data.get(
                "msg",
                "Unable to create account",
            ),
        )

    auth_data = response.json()
    user = auth_data["user"]

    return RegisterResponse(
        user_id=user["id"],
        email=user["email"],
        email_confirmation_required=auth_data.get("session") is None,
    )


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
)
async def forgot_password(
    payload: ForgotPasswordRequest,
) -> MessageResponse:
    settings = get_settings()

    redirect_url = f"{settings.frontend_url.rstrip('/')}/reset-password"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/recover",
                params={
                    "redirect_to": redirect_url,
                },
                headers={
                    "apikey": settings.supabase_api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "email": str(payload.email),
                },
            )
    except httpx.RequestError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is temporarily unavailable",
        ) from error

    if response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Please wait before requesting another reset email",
        )

    if response.status_code != status.HTTP_200_OK:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to send password reset email",
        )

    return MessageResponse(
        message=(
            "If an account exists for this email, a password reset link has been sent."
        ),
    )


@router.post(
    "/reset-password",
    response_model=MessageResponse,
)
async def reset_password(
    payload: ResetPasswordRequest,
) -> MessageResponse:
    response = await _update_password(payload.access_token, payload.password)

    if response.status_code in {
        status.HTTP_401_UNAUTHORIZED,
        status.HTTP_403_FORBIDDEN,
    }:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Password reset link is invalid or expired",
        )

    if response.status_code != status.HTTP_200_OK:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to update password",
        )

    return MessageResponse(
        message="Password has been updated successfully",
    )


@router.post(
    "/change-password",
    response_model=MessageResponse,
)
async def change_password(
    payload: ChangePasswordRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> MessageResponse:
    if not current_user.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account has no email address",
        )

    grant = await _password_grant(current_user.email, payload.current_password)

    if grant.status_code in {
        status.HTTP_400_BAD_REQUEST,
        status.HTTP_401_UNAUTHORIZED,
    }:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    if grant.status_code != status.HTTP_200_OK:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to verify current password",
        )

    try:
        fresh_access_token = grant.json()["access_token"]
    except (ValueError, KeyError) as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Authentication service returned an invalid response",
        ) from error

    response = await _update_password(fresh_access_token, payload.new_password)

    if response.status_code != status.HTTP_200_OK:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to update password",
        )

    return MessageResponse(
        message="Password has been changed successfully",
    )
