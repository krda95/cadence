import os
from datetime import datetime
from typing import Optional
import uuid
from zoneinfo import ZoneInfo

import httpx
import pytest


pytestmark = pytest.mark.integration


WARSAW_TIMEZONE = ZoneInfo("Europe/Warsaw")

API_BASE_URL = os.getenv(
    "CADENCE_API_BASE_URL",
    "http://127.0.0.1:8000",
)

CHALLENGES_PATH = os.getenv(
    "CADENCE_CHALLENGES_PATH",
    "/challenges",
)

TEST_TOKEN = os.getenv("CADENCE_TEST_TOKEN")


if not TEST_TOKEN:
    pytest.skip(
        "Set CADENCE_TEST_TOKEN before running integration tests.",
        allow_module_level=True,
    )


def create_challenge(
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
        CHALLENGES_PATH,
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
    challenge_id: str,
    entry_date: str,
    value: float,
    note: Optional[str] = None,
) -> None:
    response = client.put(
        f"{CHALLENGES_PATH}/{challenge_id}/entries/{entry_date}",
        headers=headers,
        json={
            "value": value,
            "note": note,
        },
    )

    assert response.status_code == 200, response.text


def archive_challenge(
    client: httpx.Client,
    headers: dict[str, str],
    challenge_id: str,
) -> None:
    response = client.delete(
        f"{CHALLENGES_PATH}/{challenge_id}",
        headers=headers,
    )

    assert response.status_code == 200, response.text


def find_item_by_name(items: list[dict], name: str) -> dict:
    for item in items:
        if item["name"] == name:
            return item

    raise AssertionError(f"Item named '{name}' was not found.")


def test_weekly_progress_for_current_week() -> None:
    """
    Testuje tydzień, który nadal trwa.

    Tworzymy:
    - Kroki: daily min 10 000
    - Kalorie: daily max 2 200
    - Treningi: weekly min 4
    - Alkohol: weekly max 2

    Wpisy na dziś:
    - Kroki: 12 000 -> dzienny wynik 100
    - Kalorie: 2 300 -> dzienny wynik 0
    - Treningi: 2 / 4 -> progres 50%, bez finalnego score
    - Alkohol: 3 / 2 -> exceeded, bez finalnego weekly score

    Ponieważ tydzień trwa:
    - weekly_score musi być null
    - is_final musi być false
    """
    suffix = uuid.uuid4().hex[:8]
    today = datetime.now(WARSAW_TIMEZONE).date()
    today_string = today.isoformat()

    headers = {
        "Authorization": f"Bearer {TEST_TOKEN}",
    }

    created_challenge_ids: list[str] = []

    with httpx.Client(
        base_url=API_BASE_URL,
        timeout=15.0,
    ) as client:
        try:
            steps_name = f"[TEST {suffix}] Kroki weekly"
            calories_name = f"[TEST {suffix}] Kalorie weekly"
            workouts_name = f"[TEST {suffix}] Treningi weekly"
            alcohol_name = f"[TEST {suffix}] Alkohol weekly"

            steps = create_challenge(
                client,
                headers,
                name=steps_name,
                unit="steps",
                period="daily",
                target_type="min",
                target_value=10_000,
            )
            created_challenge_ids.append(steps["id"])

            calories = create_challenge(
                client,
                headers,
                name=calories_name,
                unit="kcal",
                period="daily",
                target_type="max",
                target_value=2_200,
            )
            created_challenge_ids.append(calories["id"])

            workouts = create_challenge(
                client,
                headers,
                name=workouts_name,
                unit="workouts",
                period="weekly",
                target_type="min",
                target_value=4,
            )
            created_challenge_ids.append(workouts["id"])

            alcohol = create_challenge(
                client,
                headers,
                name=alcohol_name,
                unit="drinks",
                period="weekly",
                target_type="max",
                target_value=2,
            )
            created_challenge_ids.append(alcohol["id"])

            upsert_entry(
                client,
                headers,
                challenge_id=steps["id"],
                entry_date=today_string,
                value=12_000,
            )

            upsert_entry(
                client,
                headers,
                challenge_id=calories["id"],
                entry_date=today_string,
                value=2_300,
            )

            upsert_entry(
                client,
                headers,
                challenge_id=workouts["id"],
                entry_date=today_string,
                value=2,
            )

            upsert_entry(
                client,
                headers,
                challenge_id=alcohol["id"],
                entry_date=today_string,
                value=3,
            )

            response = client.get(
                f"{CHALLENGES_PATH}/progress/weekly",
                headers=headers,
                params={"date": today_string},
            )

            assert response.status_code == 200, response.text

            payload = response.json()

            assert payload["date"] == today_string
            assert payload["timezone"] == "Europe/Warsaw"
            assert payload["is_final"] is False
            assert payload["weekly_score"] is None

            steps_item = find_item_by_name(
                payload["items"],
                steps_name,
            )
            assert steps_item["period"] == "daily"
            assert steps_item["daily_average_score"] == 100.0
            assert steps_item["score"] is None
            assert steps_item["included_in_weekly_score"] is False

            calories_item = find_item_by_name(
                payload["items"],
                calories_name,
            )
            assert calories_item["period"] == "daily"
            assert calories_item["daily_average_score"] == 0.0
            assert calories_item["score"] is None
            assert calories_item["included_in_weekly_score"] is False

            workouts_item = find_item_by_name(
                payload["items"],
                workouts_name,
            )
            assert workouts_item["period"] == "weekly"
            assert workouts_item["current_value"] == 2.0
            assert workouts_item["progress_percent"] == 50.0
            assert workouts_item["status"] == "in_progress"
            assert workouts_item["score"] is None
            assert workouts_item["included_in_weekly_score"] is False

            alcohol_item = find_item_by_name(
                payload["items"],
                alcohol_name,
            )
            assert alcohol_item["period"] == "weekly"
            assert alcohol_item["current_value"] == 3.0
            assert alcohol_item["status"] == "exceeded"
            assert alcohol_item["score"] is None
            assert alcohol_item["included_in_weekly_score"] is False

        finally:
            for challenge_id in created_challenge_ids:
                archive_challenge(
                    client,
                    headers,
                    challenge_id,
                )