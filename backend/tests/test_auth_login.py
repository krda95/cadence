import pytest
from fastapi import HTTPException, status

from app.api.v1 import auth
from app.schemas.auth import LoginRequest


class FakeResponse:
    def __init__(self, status_code: int, payload: dict) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        return self._payload


class FakeAsyncClient:
    response = FakeResponse(
        status.HTTP_200_OK,
        {
            "access_token": "access-token",
            "refresh_token": "refresh-token",
            "expires_in": 3600,
            "token_type": "bearer",
        },
    )
    last_post: dict | None = None

    def __init__(self, *args, **kwargs) -> None:
        pass

    async def __aenter__(self) -> "FakeAsyncClient":
        return self

    async def __aexit__(self, *args) -> None:
        return None

    async def post(self, *args, **kwargs) -> FakeResponse:
        self.__class__.last_post = {
            "args": args,
            "kwargs": kwargs,
        }
        return self.__class__.response


@pytest.fixture(autouse=True)
def patch_auth_dependencies(monkeypatch: pytest.MonkeyPatch) -> None:
    FakeAsyncClient.response = FakeResponse(
        status.HTTP_200_OK,
        {
            "access_token": "access-token",
            "refresh_token": "refresh-token",
            "expires_in": 3600,
            "token_type": "bearer",
        },
    )
    FakeAsyncClient.last_post = None

    monkeypatch.setattr(auth.httpx, "AsyncClient", FakeAsyncClient)
    monkeypatch.setattr(
        auth,
        "get_settings",
        lambda: type(
            "Settings",
            (),
            {
                "supabase_url": "https://example.supabase.co",
                "supabase_api_key": "test-api-key",
            },
        )(),
    )


@pytest.mark.asyncio
async def test_login_posts_credentials_to_supabase() -> None:
    response = await auth.login(
        LoginRequest(
            email="user@example.com",
            password="secret",
        )
    )

    assert response.access_token == "access-token"
    assert response.refresh_token == "refresh-token"
    assert FakeAsyncClient.last_post == {
        "args": ("https://example.supabase.co/auth/v1/token",),
        "kwargs": {
            "params": {
                "grant_type": "password",
            },
            "headers": {
                "apikey": "test-api-key",
                "Content-Type": "application/json",
            },
            "json": {
                "email": "user@example.com",
                "password": "secret",
            },
        },
    }


@pytest.mark.asyncio
async def test_login_maps_invalid_credentials_to_unauthorized() -> None:
    FakeAsyncClient.response = FakeResponse(status.HTTP_400_BAD_REQUEST, {})

    with pytest.raises(HTTPException) as exc_info:
        await auth.login(
            LoginRequest(
                email="user@example.com",
                password="wrong",
            )
        )

    assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
async def test_login_maps_supabase_errors_to_bad_gateway() -> None:
    FakeAsyncClient.response = FakeResponse(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        {},
    )

    with pytest.raises(HTTPException) as exc_info:
        await auth.login(
            LoginRequest(
                email="user@example.com",
                password="secret",
            )
        )

    assert exc_info.value.status_code == status.HTTP_502_BAD_GATEWAY
