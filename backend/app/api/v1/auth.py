import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import ValidationError

from app.core.config import get_settings
from app.schemas.auth import LoginRequest, LoginResponse, RegisterRequest, RegisterResponse


router = APIRouter(
    prefix="/auth",
    tags=["Auth"],
)


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest) -> LoginResponse:
    settings = get_settings()

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/token",
                params={
                    "grant_type": "password",
                },
                headers={
                    "apikey": settings.supabase_api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "email": str(payload.email),
                    "password": payload.password,
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
