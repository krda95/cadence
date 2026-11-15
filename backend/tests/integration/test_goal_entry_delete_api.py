import os
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx
import pytest

pytestmark = pytest.mark.integration

WARSAW_TIMEZONE = ZoneInfo("Europe/Warsaw")

API_BASE_URL = os.getenv("CADENCE_API_BASE_URL", "http://127.0.0.1:8000")
GOALS_PATH = os.getenv("CADENCE_GOALS_PATH", "/api/v1/goals")
TEST_TOKEN = os.getenv("CADENCE_TEST_TOKEN")

if not TEST_TOKEN:
    pytest.skip(
        "Set CADENCE_TEST_TOKEN before running integration tests.",
        allow_module_level=True,
    )


HEADERS = {
    "Authorization": f"Bearer {TEST_TOKEN}",
    "X-Timezone": "Europe/Warsaw",
}


@pytest.fixture
def client():
    with httpx.Client(base_url=API_BASE_URL, timeout=15.0) as http_client:
        yield http_client


def make_goal(client: httpx.Client, *, period: str, target_type: str, target: float):
    response = client.post(
        GOALS_PATH,
        headers=HEADERS,
        json={
            "name": f"[TEST {uuid.uuid4().hex[:8]}] delete entry",
            "icon": None,
            "unit": "units",
            "period": period,
            "target_type": target_type,
            "target_value": target,
            "is_active": True,
        },
    )
    assert response.status_code == 201, response.text

    return response.json()


def put_entry(client: httpx.Client, goal_id: str, entry_date: str, value: float, note):
    response = client.put(
        f"{GOALS_PATH}/{goal_id}/entries/{entry_date}",
        headers=HEADERS,
        json={"value": value, "note": note},
    )
    assert response.status_code == 200, response.text


def delete_entry(client: httpx.Client, goal_id: str, entry_date: str):
    return client.delete(
        f"{GOALS_PATH}/{goal_id}/entries/{entry_date}",
        headers=HEADERS,
    )


def entries_for_day(client: httpx.Client, entry_date: str) -> dict[str, dict]:
    response = client.get(
        f"{GOALS_PATH}/entries",
        headers=HEADERS,
        params={"date": entry_date},
    )
    assert response.status_code == 200, response.text

    return {item["goal_id"]: item for item in response.json()}


def archive(client: httpx.Client, goal_id: str) -> None:
    client.delete(f"{GOALS_PATH}/{goal_id}", headers=HEADERS)


def test_delete_daily_entry_removes_value_and_note(client: httpx.Client) -> None:
    today = datetime.now(WARSAW_TIMEZONE).date().isoformat()
    goal = make_goal(client, period="daily", target_type="min", target=10)

    try:
        put_entry(client, goal["id"], today, 7, "typo")

        response = delete_entry(client, goal["id"], today)
        assert response.status_code == 204, response.text

        day = entries_for_day(client, today)[goal["id"]]
        assert day["entry_value"] is None
        assert day["note"] is None
    finally:
        archive(client, goal["id"])


def test_delete_weekly_entry_removes_only_that_days_contribution(
    client: httpx.Client,
) -> None:
    today = datetime.now(WARSAW_TIMEZONE).date()
    goal = make_goal(client, period="weekly", target_type="min", target=10)

    try:
        put_entry(client, goal["id"], today.isoformat(), 4, None)
        assert entries_for_day(client, today.isoformat())[goal["id"]]["period_value"] == 4

        assert delete_entry(client, goal["id"], today.isoformat()).status_code == 204

        day = entries_for_day(client, today.isoformat())[goal["id"]]
        assert day["entry_value"] is None
        assert day["period_value"] == 0
    finally:
        archive(client, goal["id"])


def test_delete_missing_entry_returns_404(client: httpx.Client) -> None:
    today = datetime.now(WARSAW_TIMEZONE).date().isoformat()
    goal = make_goal(client, period="daily", target_type="max", target=5)

    try:
        assert delete_entry(client, goal["id"], today).status_code == 404

        put_entry(client, goal["id"], today, 1, None)
        assert delete_entry(client, goal["id"], today).status_code == 204
        assert delete_entry(client, goal["id"], today).status_code == 404
    finally:
        archive(client, goal["id"])


def test_delete_entry_of_unknown_goal_returns_404(client: httpx.Client) -> None:
    today = datetime.now(WARSAW_TIMEZONE).date().isoformat()

    response = delete_entry(client, str(uuid.uuid4()), today)

    assert response.status_code == 404
