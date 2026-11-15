import os
import uuid
from datetime import datetime
from typing import Optional
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
# Domyślnie /api/v1/goals. Ustaw CADENCE_GOALS_PATH, jeśli endpointy są pod inną ścieżką.
GOALS_PATH = os.getenv(
    "CADENCE_GOALS_PATH",
    "/api/v1/goals",
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


def test_daily_progress_with_weekly_adjustments() -> None:
    """
    Daily goals contribute scores of 100%, 0% and 100%.
    Their average is 66.67%.

    The weekly workout entry adds 5 percentage points.
    The weekly alcohol entry subtracts 5 percentage points.
    Both adjustments apply once per goal, regardless of entry quantity.

    The alcohol penalty also applies within the weekly limit.
    """
    unique_suffix = uuid.uuid4().hex[:8]
    today = datetime.now(WARSAW_TIMEZONE).date()
    today_string = today.isoformat()

    headers = {
        "Authorization": f"Bearer {TEST_TOKEN}",
        "X-Timezone": "Europe/Warsaw",
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
            assert payload["has_entries"] is True
            assert payload["included_in_averages"] is True

            # Wybieramy cele utworzone przez ten test.
            test_components = [
                component
                for component in payload["components"]
                if component["goal_id"] in created_goal_ids
            ]

            # Bazę tworzą wyłącznie trzy cele daily.
            assert len(test_components) == 3

            for component in test_components:
                assert component["period"] == "daily"
                assert component["included_in_daily_score"] is True
                assert component["is_period_limit_penalty"] is False

            steps_component = find_item_by_name(
                test_components,
                f"[TEST {unique_suffix}] Kroki",
            )
            assert steps_component["score"] == 100.0

            calories_component = find_item_by_name(
                test_components,
                f"[TEST {unique_suffix}] Kalorie",
            )
            assert calories_component["score"] == 0.0
            assert calories_component["status"] == "exceeded"

            reading_component = find_item_by_name(
                test_components,
                f"[TEST {unique_suffix}] Czytanie",
            )
            assert reading_component["score"] == 100.0

            test_daily_scores = [
                component["score"]
                for component in test_components
            ]
            test_base_score = sum(test_daily_scores) / len(test_daily_scores)

            assert round(test_base_score, 2) == 66.67

            workouts_progress = find_item_by_name(
                payload["periodic_progress"],
                f"[TEST {unique_suffix}] Treningi",
            )
            assert workouts_progress["current_value"] == 2.0
            assert workouts_progress["target_value"] == 4.0
            assert workouts_progress["status"] == "in_progress"
            assert workouts_progress["caused_daily_penalty"] is False
            assert workouts_progress["daily_adjustment_pp"] == 5.0

            alcohol_progress = find_item_by_name(
                payload["periodic_progress"],
                f"[TEST {unique_suffix}] Alkohol",
            )
            assert alcohol_progress["current_value"] == 3.0
            assert alcohol_progress["target_value"] == 2.0
            assert alcohol_progress["status"] == "exceeded"
            assert alcohol_progress["caused_daily_penalty"] is True
            assert alcohol_progress["daily_adjustment_pp"] == -5.0

            # Wynik całego konta uwzględnia też ewentualne inne cele.
            expected_daily_score = (
                payload["base_score"] + payload["weekly_adjustment_pp"]
            )

            if expected_daily_score > 100.0:
                expected_daily_score = 100.0
            elif expected_daily_score < 0.0:
                expected_daily_score = 0.0

            assert payload["daily_score"] == pytest.approx(
                expected_daily_score,
                abs=0.01,
            )

            # Nadpisujemy 3 drinki wartością 1.
            # Kara dzienna obowiązuje również w tygodniowym limicie.
            upsert_entry(
                client,
                headers,
                goal_id=alcohol["id"],
                entry_date=today_string,
                value=1,
            )

            response = client.get(
                f"{GOALS_PATH}/progress/daily",
                headers=headers,
                params={"date": today_string},
            )

            assert response.status_code == 200, response.text

            updated_payload = response.json()

            updated_alcohol_progress = find_item_by_name(
                updated_payload["periodic_progress"],
                f"[TEST {unique_suffix}] Alkohol",
            )

            assert updated_alcohol_progress["current_value"] == 1.0
            assert updated_alcohol_progress["status"] == "in_progress"
            assert updated_alcohol_progress["caused_daily_penalty"] is True
            assert updated_alcohol_progress["daily_adjustment_pp"] == -5.0

            assert (
                updated_payload["weekly_adjustment_pp"]
                == payload["weekly_adjustment_pp"]
            )
            assert updated_payload["daily_score"] == payload["daily_score"]

        finally:
            for goal_id in created_goal_ids:
                archive_goal(
                    client,
                    headers,
                    goal_id,
                )
