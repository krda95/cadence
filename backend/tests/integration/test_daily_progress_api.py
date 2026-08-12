import os
from typing import Optional
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx
import pytest


pytestmark = pytest.mark.integration


WARSAW_TIMEZONE = ZoneInfo("Europe/Warsaw")

API_BASE_URL = os.getenv(
    "CADENCE_API_BASE_URL",
    "http://127.0.0.1:8000",
)

# Ustaw zgodnie z rzeczywistym prefixem z /docs.
# Jeśli endpointy widzisz jako /api/v1/goals, ustaw tę wartość w terminalu.
GOALS_PATH = os.getenv(
    "CADENCE_GOALS_PATH",
    "/goals",
)

TEST_TOKEN = os.getenv("CADENCE_TEST_TOKEN")


if not TEST_TOKEN:
    pytest.skip(
        "Set CADENCE_TEST_TOKEN before running integration tests.",
        allow_module_level=True,
    )


def create_goal(
    client: httpx.Client,
    headers: dict[str, str],
    *,
    name: str,
    unit: str,
    period: str,
    target_type: str,
    target_value: float,
) -> dict:
    response = client.post(
        f"{GOALS_PATH}",
        headers=headers,
        json={
            "name": name,
            "icon": None,
            "unit": unit,
            "period": period,
            "target_type": target_type,
            "target_value": target_value,
            "is_active": True,
        },
    )

    assert response.status_code == 201, response.text

    return response.json()


def upsert_entry(
    client: httpx.Client,
    headers: dict[str, str],
    *,
    goal_id: str,
    entry_date: str,
    value: float,
    note: Optional[str] = None,
) -> None:
    response = client.put(
        f"{GOALS_PATH}/{goal_id}/entries/{entry_date}",
        headers=headers,
        json={
            "value": value,
            "note": note,
        },
    )

    assert response.status_code == 200, response.text


def archive_goal(
    client: httpx.Client,
    headers: dict[str, str],
    goal_id: str,
) -> None:
    response = client.delete(
        f"{GOALS_PATH}/{goal_id}",
        headers=headers,
    )

    assert response.status_code == 200, response.text


def find_item_by_name(items: list[dict], name: str) -> dict:
    for item in items:
        if item["name"] == name:
            return item

    raise AssertionError(f"Item named '{name}' was not found.")


def test_daily_progress_with_weekly_max_penalty() -> None:
    """
    Scenario:

    - Kroki daily min: 12 000 / 10 000 -> 100
    - Kalorie daily max: 2 300 / 2 200 -> 0
    - Czytanie daily min: 20 / 20 -> 100
    - Treningi weekly min: 2 / 4 -> does not affect daily score
    - Alkohol weekly max: 3 / 2 -> daily penalty 0

    Expected daily score:
    (100 + 0 + 100 + 0) / 4 = 50
    """
    unique_suffix = uuid.uuid4().hex[:8]
    today = datetime.now(WARSAW_TIMEZONE).date()
    today_string = today.isoformat()

    headers = {
        "Authorization": f"Bearer {TEST_TOKEN}",
    }

    created_goal_ids: list[str] = []

    with httpx.Client(
        base_url=API_BASE_URL,
        timeout=15.0,
    ) as client:
        try:
            steps = create_goal(
                client,
                headers,
                name=f"[TEST {unique_suffix}] Kroki",
                unit="steps",
                period="daily",
                target_type="min",
                target_value=10_000,
            )
            created_goal_ids.append(steps["id"])

            calories = create_goal(
                client,
                headers,
                name=f"[TEST {unique_suffix}] Kalorie",
                unit="kcal",
                period="daily",
                target_type="max",
                target_value=2_200,
            )
            created_goal_ids.append(calories["id"])

            reading = create_goal(
                client,
                headers,
                name=f"[TEST {unique_suffix}] Czytanie",
                unit="pages",
                period="daily",
                target_type="min",
                target_value=20,
            )
            created_goal_ids.append(reading["id"])

            workouts = create_goal(
                client,
                headers,
                name=f"[TEST {unique_suffix}] Treningi",
                unit="workouts",
                period="weekly",
                target_type="min",
                target_value=4,
            )
            created_goal_ids.append(workouts["id"])

            alcohol = create_goal(
                client,
                headers,
                name=f"[TEST {unique_suffix}] Alkohol",
                unit="drinks",
                period="weekly",
                target_type="max",
                target_value=2,
            )
            created_goal_ids.append(alcohol["id"])

            upsert_entry(
                client,
                headers,
                goal_id=steps["id"],
                entry_date=today_string,
                value=12_000,
            )

            upsert_entry(
                client,
                headers,
                goal_id=calories["id"],
                entry_date=today_string,
                value=2_300,
            )

            upsert_entry(
                client,
                headers,
                goal_id=reading["id"],
                entry_date=today_string,
                value=20,
            )

            upsert_entry(
                client,
                headers,
                goal_id=workouts["id"],
                entry_date=today_string,
                value=2,
            )

            upsert_entry(
                client,
                headers,
                goal_id=alcohol["id"],
                entry_date=today_string,
                value=3,
            )

            response = client.get(
                f"{GOALS_PATH}/progress/daily",
                headers=headers,
                params={
                    "date": today_string,
                },
            )

            assert response.status_code == 200, response.text

            payload = response.json()

            assert payload["date"] == today_string
            assert payload["timezone"] == "Europe/Warsaw"
            assert payload["is_final"] is False
            assert payload["daily_score"] == 50.0
            assert payload["scored_components_count"] == 4

            steps_component = find_item_by_name(
                payload["components"],
                f"[TEST {unique_suffix}] Kroki",
            )
            assert steps_component["score"] == 100.0
            assert steps_component["included_in_daily_score"] is True

            calories_component = find_item_by_name(
                payload["components"],
                f"[TEST {unique_suffix}] Kalorie",
            )
            assert calories_component["score"] == 0.0
            assert calories_component["status"] == "exceeded"

            reading_component = find_item_by_name(
                payload["components"],
                f"[TEST {unique_suffix}] Czytanie",
            )
            assert reading_component["score"] == 100.0

            alcohol_component = find_item_by_name(
                payload["components"],
                f"[TEST {unique_suffix}] Alkohol",
            )
            assert alcohol_component["score"] == 0.0
            assert alcohol_component["is_period_limit_penalty"] is True

            workouts_progress = find_item_by_name(
                payload["periodic_progress"],
                f"[TEST {unique_suffix}] Treningi",
            )
            assert workouts_progress["current_value"] == 2.0
            assert workouts_progress["target_value"] == 4.0
            assert workouts_progress["status"] == "in_progress"
            assert workouts_progress["caused_daily_penalty"] is False

            alcohol_progress = find_item_by_name(
                payload["periodic_progress"],
                f"[TEST {unique_suffix}] Alkohol",
            )
            assert alcohol_progress["current_value"] == 3.0
            assert alcohol_progress["target_value"] == 2.0
            assert alcohol_progress["status"] == "exceeded"
            assert alcohol_progress["caused_daily_penalty"] is True

        finally:
            for goal_id in created_goal_ids:
                archive_goal(
                    client,
                    headers,
                    goal_id,
                )