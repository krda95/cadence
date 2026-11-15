import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace

import httpx
import pytest
from fastapi import status

from app.core.timezone import (
    DEFAULT_TIMEZONE_NAME,
    TIMEZONE_HEADER,
    get_request_timezone,
    parse_timezone,
    set_request_timezone,
)
from app.dependencies.auth import CurrentUser, get_current_user
from app.core.database import get_db_session
from app.main import app
from app.services import dashboard_service, progress_service

# 2026-03-10 23:30 UTC: a different calendar day depending on the zone.
FIXED_NOW_UTC = datetime(2026, 3, 10, 23, 30, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def reset_timezone():
    set_request_timezone(None)
    yield
    set_request_timezone(None)


@pytest.fixture
def frozen_now(monkeypatch):
    monkeypatch.delenv("CADENCE_TEST_TODAY", raising=False)

    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return FIXED_NOW_UTC.astimezone(tz) if tz else FIXED_NOW_UTC

    monkeypatch.setattr(progress_service, "datetime", FrozenDatetime)


@pytest.mark.parametrize(
    "name",
    [None, "", "Not/AZone", "../etc/passwd", "x" * 500],
)
def test_parse_timezone_falls_back_to_utc(name):
    assert parse_timezone(name).key == DEFAULT_TIMEZONE_NAME


@pytest.mark.parametrize(
    "name",
    ["Europe/Warsaw", "America/New_York", "Pacific/Kiritimati", "Asia/Kolkata"],
)
def test_parse_timezone_accepts_iana_names(name):
    assert parse_timezone(name).key == name


@pytest.mark.parametrize(
    ("tz_name", "expected_today"),
    [
        (None, date(2026, 3, 10)),
        ("UTC", date(2026, 3, 10)),
        ("Europe/Warsaw", date(2026, 3, 11)),
        ("Pacific/Kiritimati", date(2026, 3, 11)),  # UTC+14
        ("America/New_York", date(2026, 3, 10)),
        ("Pacific/Pago_Pago", date(2026, 3, 10)),  # UTC-11
    ],
)
def test_get_user_today_follows_request_timezone(frozen_now, tz_name, expected_today):
    set_request_timezone(tz_name)

    assert progress_service.get_user_today() == expected_today


def test_get_user_today_respects_dst(frozen_now, monkeypatch):
    # Warsaw is UTC+2 in summer: 22:30 UTC is already the next day, but not in winter.
    class SummerDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            moment = datetime(2026, 7, 10, 22, 30, tzinfo=timezone.utc)
            return moment.astimezone(tz) if tz else moment

    monkeypatch.setattr(progress_service, "datetime", SummerDatetime)
    set_request_timezone("Europe/Warsaw")
    assert progress_service.get_user_today() == date(2026, 7, 11)

    class WinterDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            moment = datetime(2026, 1, 10, 22, 30, tzinfo=timezone.utc)
            return moment.astimezone(tz) if tz else moment

    monkeypatch.setattr(progress_service, "datetime", WinterDatetime)
    assert progress_service.get_user_today() == date(2026, 1, 10)


def test_test_today_override_wins_over_timezone(monkeypatch):
    monkeypatch.setenv("CADENCE_TEST_TODAY", "2020-02-02")
    set_request_timezone("Pacific/Kiritimati")

    assert progress_service.get_user_today() == date(2020, 2, 2)


@pytest.mark.parametrize(
    ("tz_name", "expected"),
    [
        (None, date(2026, 3, 10)),
        ("Europe/Warsaw", date(2026, 3, 11)),
        ("America/New_York", date(2026, 3, 10)),
    ],
)
def test_goal_created_date_uses_request_timezone(tz_name, expected):
    goal = SimpleNamespace(created_at=FIXED_NOW_UTC)
    set_request_timezone(tz_name)

    assert progress_service.get_goal_created_date(goal) == expected


def test_goal_created_date_treats_naive_datetime_as_given():
    goal = SimpleNamespace(created_at=datetime(2026, 3, 10, 23, 30))
    set_request_timezone("Pacific/Kiritimati")

    assert progress_service.get_goal_created_date(goal) == date(2026, 3, 10)


def test_build_daily_progress_reports_request_timezone():
    set_request_timezone("America/New_York")

    result = progress_service.build_daily_progress(
        goal_states=[],
        reference_date=date(2026, 3, 10),
        today=date(2026, 3, 10),
    )

    assert result.timezone == "America/New_York"


class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return self._rows

    def scalar(self):
        return self._rows[0] if self._rows else None


class FakeSession:
    """Returns the given goals for the first query and nothing afterwards."""

    def __init__(self, goals):
        self.goals = goals
        self.calls = 0

    async def execute(self, *_args, **_kwargs):
        self.calls += 1
        return FakeResult(self.goals if self.calls == 1 else [])

    async def scalar(self, *_args, **_kwargs):
        return self.goals[0].created_at if self.goals else None


async def test_goal_created_late_evening_utc_is_not_applicable_yet_in_warsaw():
    goal = SimpleNamespace(
        id=uuid.uuid4(),
        created_at=FIXED_NOW_UTC,
        period=progress_service.GoalPeriod.DAILY,
    )
    set_request_timezone("Europe/Warsaw")

    states = await progress_service.load_goal_day_states(
        session=FakeSession([goal]),
        owner_id=uuid.uuid4(),
        reference_date=date(2026, 3, 10),
    )

    assert states == []


async def test_dashboard_first_goal_date_uses_request_timezone():
    goal = SimpleNamespace(created_at=FIXED_NOW_UTC)
    session = FakeSession([goal])

    set_request_timezone("Europe/Warsaw")
    assert await dashboard_service.get_first_goal_date(session, uuid.uuid4()) == date(
        2026, 3, 11
    )

    set_request_timezone("America/New_York")
    assert await dashboard_service.get_first_goal_date(session, uuid.uuid4()) == date(
        2026, 3, 10
    )


# --- HTTP layer: header -> middleware -> response -------------------------


@pytest.fixture
def api_overrides():
    async def fake_db():
        yield FakeSession([])

    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        id=uuid.uuid4(), email=None, username=None
    )
    app.dependency_overrides[get_db_session] = fake_db
    yield
    app.dependency_overrides.clear()


async def get_daily(headers: dict[str, str]) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get("/api/v1/goals/progress/daily", headers=headers)


@pytest.mark.parametrize(
    ("header_value", "expected"),
    [
        ("Europe/Warsaw", "Europe/Warsaw"),
        ("America/New_York", "America/New_York"),
        ("Pacific/Kiritimati", "Pacific/Kiritimati"),
        ("garbage", "UTC"),
    ],
)
async def test_api_echoes_timezone_from_header(api_overrides, header_value, expected):
    response = await get_daily({TIMEZONE_HEADER: header_value})

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["timezone"] == expected


async def test_api_defaults_to_utc_without_header(api_overrides):
    response = await get_daily({})

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["timezone"] == "UTC"


async def test_api_default_date_is_today_in_header_timezone(api_overrides, frozen_now):
    warsaw = (await get_daily({TIMEZONE_HEADER: "Europe/Warsaw"})).json()
    new_york = (await get_daily({TIMEZONE_HEADER: "America/New_York"})).json()

    assert warsaw["date"] == "2026-03-11"
    assert new_york["date"] == "2026-03-10"


async def test_api_rejects_date_in_the_future_for_user_timezone(
    api_overrides, frozen_now
):
    # 2026-03-11 is "today" in Warsaw but still the future in New York.
    params = {"date": "2026-03-11"}
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        warsaw = await client.get(
            "/api/v1/goals/progress/daily",
            params=params,
            headers={TIMEZONE_HEADER: "Europe/Warsaw"},
        )
        new_york = await client.get(
            "/api/v1/goals/progress/daily",
            params=params,
            headers={TIMEZONE_HEADER: "America/New_York"},
        )

    assert warsaw.status_code == status.HTTP_200_OK
    assert new_york.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


async def test_concurrent_requests_do_not_leak_timezone(api_overrides):
    import asyncio

    zones = ["Europe/Warsaw", "America/New_York", "Asia/Tokyo", "UTC"] * 5
    responses = await asyncio.gather(*(get_daily({TIMEZONE_HEADER: z}) for z in zones))

    assert [r.json()["timezone"] for r in responses] == zones
    assert get_request_timezone().key == "UTC"
