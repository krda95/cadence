import uuid
from urllib.parse import parse_qs, urlparse

from app.api.v1 import auth
from app.dependencies.auth import current_user_from_supabase

USER_ID = str(uuid.uuid4())


def test_google_user_gets_name_from_full_name_and_no_password() -> None:
    user = current_user_from_supabase(
        {
            "id": USER_ID,
            "email": "ada@gmail.com",
            "user_metadata": {"full_name": "Ada Lovelace", "name": "Ada"},
            "app_metadata": {"provider": "google", "providers": ["google"]},
        }
    )

    assert user.username == "Ada Lovelace"
    assert user.providers == ("google",)
    assert "email" not in user.providers


def test_email_user_keeps_own_display_name() -> None:
    user = current_user_from_supabase(
        {
            "id": USER_ID,
            "email": "ada@example.com",
            "user_metadata": {"display_name": "ada", "full_name": "Ada Lovelace"},
            "app_metadata": {"providers": ["email", "google"]},
        }
    )

    assert user.username == "ada"
    assert "email" in user.providers


def test_missing_metadata_is_tolerated() -> None:
    user = current_user_from_supabase({"id": USER_ID})

    assert user.username is None
    assert user.providers == ()


async def test_google_oauth_redirects_to_supabase_with_callback(monkeypatch) -> None:
    monkeypatch.setattr(
        auth,
        "get_settings",
        lambda: type(
            "Settings",
            (),
            {
                "supabase_url": "https://example.supabase.co/",
                "frontend_url": "http://localhost:4200/",
            },
        )(),
    )

    response = await auth.start_google_oauth()
    location = urlparse(response.headers["location"])
    query = parse_qs(location.query)

    assert response.status_code == 307
    assert f"{location.scheme}://{location.netloc}{location.path}" == (
        "https://example.supabase.co/auth/v1/authorize"
    )
    assert query["provider"] == ["google"]
    assert query["redirect_to"] == ["http://localhost:4200/auth/callback"]
