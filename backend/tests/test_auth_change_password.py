import uuid

import pytest
from fastapi import HTTPException, status

from app.api.v1 import auth
from app.dependencies.auth import CurrentUser
from app.schemas.auth import ChangePasswordRequest

USER = CurrentUser(id=uuid.uuid4(), email="user@example.com", username="user")


class FakeResponse:
    def __init__(self, status_code: int, payload: dict | None = None) -> None:
        self.status_code = status_code
        self._payload = payload or {}

    def json(self) -> dict:
        return self._payload


class FakeAsyncClient:
    post_response = FakeResponse(status.HTTP_200_OK, {"access_token": "fresh-token"})
    put_response = FakeResponse(status.HTTP_200_OK)
    last_post: dict | None = None
    last_put: dict | None = None

    def __init__(self, *args, **kwargs) -> None:
        pass

    async def __aenter__(self) -> "FakeAsyncClient":
        return self

    async def __aexit__(self, *args) -> None:
        return None

    async def post(self, *args, **kwargs) -> FakeResponse:
        self.__class__.last_post = kwargs
        return self.__class__.post_response

    async def put(self, *args, **kwargs) -> FakeResponse:
        self.__class__.last_put = kwargs
        return self.__class__.put_response


@pytest.fixture(autouse=True)
def patch_supabase(monkeypatch: pytest.MonkeyPatch) -> None:
    FakeAsyncClient.post_response = FakeResponse(
        status.HTTP_200_OK, {"access_token": "fresh-token"}
    )
    FakeAsyncClient.put_response = FakeResponse(status.HTTP_200_OK)
    FakeAsyncClient.last_post = None
    FakeAsyncClient.last_put = None

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


def make_payload() -> ChangePasswordRequest:
    return ChangePasswordRequest(
        current_password="old-password",
        new_password="new-password",
    )


async def test_change_password_verifies_current_password_and_uses_fresh_token() -> None:
    result = await auth.change_password(make_payload(), USER)

    assert result.message == "Password has been changed successfully"
    assert FakeAsyncClient.last_post["json"] == {
        "email": "user@example.com",
        "password": "old-password",
    }
    assert FakeAsyncClient.last_put["headers"]["Authorization"] == "Bearer fresh-token"
    assert FakeAsyncClient.last_put["json"] == {"password": "new-password"}


@pytest.mark.parametrize("supabase_status", [400, 401])
async def test_wrong_current_password_returns_400_and_skips_update(
    supabase_status: int,
) -> None:
    FakeAsyncClient.post_response = FakeResponse(supabase_status)

    with pytest.raises(HTTPException) as exc:
        await auth.change_password(make_payload(), USER)

    assert exc.value.status_code == status.HTTP_400_BAD_REQUEST
    assert exc.value.detail == "Current password is incorrect"
    assert FakeAsyncClient.last_put is None


async def test_user_without_email_returns_400() -> None:
    user = CurrentUser(id=uuid.uuid4(), email=None, username="user")

    with pytest.raises(HTTPException) as exc:
        await auth.change_password(make_payload(), user)

    assert exc.value.status_code == status.HTTP_400_BAD_REQUEST
    assert FakeAsyncClient.last_post is None


async def test_supabase_update_failure_returns_502() -> None:
    FakeAsyncClient.put_response = FakeResponse(status.HTTP_500_INTERNAL_SERVER_ERROR)

    with pytest.raises(HTTPException) as exc:
        await auth.change_password(make_payload(), USER)

    assert exc.value.status_code == status.HTTP_502_BAD_GATEWAY


async def test_supabase_unavailable_returns_503(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def raise_request_error(*args, **kwargs):
        raise auth.httpx.ConnectError("boom")

    monkeypatch.setattr(FakeAsyncClient, "post", raise_request_error)

    with pytest.raises(HTTPException) as exc:
        await auth.change_password(make_payload(), USER)

    assert exc.value.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
