import os
import uuid
from datetime import date, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from app.main import app


pytestmark = pytest.mark.integration


WARSAW_TIMEZONE = ZoneInfo("Europe/Warsaw")

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
    client: TestClient,
    headers: dict[str, str],
    *,
    name: str,
    unit: str,
    period: str,
    target_type: str,
    target_value: float,
) -> dict:
    response = client.post(
        GOALS_PATH,
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
    client: TestClient,
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
    client: TestClient,
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


def parse_warsaw_date(value: str) -> date:
    timestamp = datetime.fromisoformat(value)

    if timestamp.tzinfo is None:
        return timestamp.date()

    return timestamp.astimezone(WARSAW_TIMEZONE).date()


def test_weekly_progress_is_final_after_simulated_week(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """
    Scenario:

    1. On the goal creation day:
       - create four goals;
       - add one set of entries for that day.

    2. Simulate that the ISO week has finished.

    3. Ask API for progress of the previous week.

    Expected final scores:
    - Steps daily MIN: one successful day, remaining days without entries -> partial.
    - Calories daily MAX: one failed day, remaining days without entries -> partial.
    - Workouts weekly MIN: 2 / 4 -> 50%.
    - Alcohol weekly MAX: 3 / 2 -> 0%.

    Daily goal averages always add up to 100:
    - steps:    100 / days_counted
    - calories: remaining percentage

    Therefore:
    weekly_score = (daily_steps + daily_calories + 50 + 0) / 4.
    """
    headers = {
        "Authorization": f"Bearer {TEST_TOKEN}",
    }

    suffix = uuid.uuid4().hex[:8]
    created_goal_ids: list[str] = []

    with TestClient(app) as client:
        try:
            steps_name = f"[TEST {suffix}] Steps weekly"
            calories_name = f"[TEST {suffix}] Calories weekly"
            workouts_name = f"[TEST {suffix}] Workouts weekly"
            alcohol_name = f"[TEST {suffix}] Alcohol weekly"

            steps = create_goal(
                client,
                headers,
                name=steps_name,
                unit="steps",
                period="daily",
                target_type="min",
                target_value=10_000,
            )
            created_goal_ids.append(steps["id"])

            calories = create_goal(
                client,
                headers,
                name=calories_name,
                unit="kcal",
                period="daily",
                target_type="max",
                target_value=2_200,
            )
            created_goal_ids.append(calories["id"])

            workouts = create_goal(
                client,
                headers,
                name=workouts_name,
                unit="workouts",
                period="weekly",
                target_type="min",
                target_value=4,
            )
            created_goal_ids.append(workouts["id"])

            alcohol = create_goal(
                client,
                headers,
                name=alcohol_name,
                unit="drinks",
                period="weekly",
                target_type="max",
                target_value=2,
            )
            created_goal_ids.append(alcohol["id"])

            scenario_date = parse_warsaw_date(steps["created_at"])

            # ISO week: Monday through Sunday.
            week_start = scenario_date - timedelta(days=scenario_date.weekday())
            week_end = week_start + timedelta(days=6)

            scenario_date_string = scenario_date.isoformat()

            upsert_entry(
                client,
                headers,
                goal_id=steps["id"],
                entry_date=scenario_date_string,
                value=12_000,
            )

            upsert_entry(
                client,
                headers,
                goal_id=calories["id"],
                entry_date=scenario_date_string,
                value=2_300,
            )

            upsert_entry(
                client,
                headers,
                goal_id=workouts["id"],
                entry_date=scenario_date_string,
                value=2,
            )

            upsert_entry(
                client,
                headers,
                goal_id=alcohol["id"],
                entry_date=scenario_date_string,
                value=3,
            )

            # The week becomes final: app now believes it is after Sunday.
            monkeypatch.setenv(
                "CADENCE_TEST_TODAY",
                (week_end + timedelta(days=1)).isoformat(),
            )

            response = client.get(
                f"{GOALS_PATH}/progress/weekly",
                headers=headers,
                params={
                    "date": week_end.isoformat(),
                },
            )

            assert response.status_code == 200, response.text

            payload = response.json()

            assert payload["date"] == week_end.isoformat()
            assert payload["period_start"] == week_start.isoformat()
            assert payload["period_end"] == week_end.isoformat()
            assert payload["timezone"] == "Europe/Warsaw"
            assert payload["is_final"] is True

            # Goal was created today, so only today through Sunday
            # should be counted for daily goals.
            expected_days_counted = (
                (week_end - scenario_date).days + 1
            )

            expected_steps_score = round(
                100 / expected_days_counted,
                2,
            )

            expected_calories_score = round(
                100 - expected_steps_score,
                2,
            )

            expected_weekly_score = round(
                (
                    expected_steps_score
                    + expected_calories_score
                    + 50
                    + 0
                )
                / 4,
                2,
            )

            assert payload["weekly_score"] == expected_weekly_score

            steps_item = find_item_by_name(
                payload["items"],
                steps_name,
            )
            assert steps_item["period"] == "daily"
            assert steps_item["days_counted"] == expected_days_counted
            assert steps_item["daily_average_score"] == expected_steps_score
            assert steps_item["score"] == expected_steps_score
            assert steps_item["status"] == "partially_achieved"
            assert steps_item["included_in_weekly_score"] is True

            calories_item = find_item_by_name(
                payload["items"],
                calories_name,
            )
            assert calories_item["period"] == "daily"
            assert calories_item["days_counted"] == expected_days_counted
            assert calories_item["daily_average_score"] == expected_calories_score
            assert calories_item["score"] == expected_calories_score
            assert calories_item["status"] == "partially_achieved"
            assert calories_item["included_in_weekly_score"] is True

            workouts_item = find_item_by_name(
                payload["items"],
                workouts_name,
            )
            assert workouts_item["period"] == "weekly"
            assert workouts_item["current_value"] == 2.0
            assert workouts_item["progress_percent"] == 50.0
            assert workouts_item["score"] == 50.0
            assert workouts_item["status"] == "partially_achieved"
            assert workouts_item["included_in_weekly_score"] is True

            alcohol_item = find_item_by_name(
                payload["items"],
                alcohol_name,
            )
            assert alcohol_item["period"] == "weekly"
            assert alcohol_item["current_value"] == 3.0
            assert alcohol_item["score"] == 0.0
            assert alcohol_item["status"] == "exceeded"
            assert alcohol_item["included_in_weekly_score"] is True

        finally:
            for goal_id in created_goal_ids:
                archive_goal(
                    client,
                    headers,
                    goal_id,
                )
