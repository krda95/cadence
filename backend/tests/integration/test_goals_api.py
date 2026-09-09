import os
import uuid

import httpx
import pytest

pytestmark = pytest.mark.integration


API_BASE_URL = os.getenv(
    "CADENCE_API_BASE_URL",
    "http://127.0.0.1:8000",
)

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
    period: str,
) -> dict:
    response = client.post(
        GOALS_PATH,
        headers=headers,
        json={
            "name": name,
            "icon": None,
            "unit": "test",
            "period": period,
            "target_type": "min",
            "target_value": 1,
            "is_active": True,
        },
    )

    assert response.status_code == 201, response.text

    return response.json()


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


def reorder_goals(
    client: httpx.Client,
    headers: dict[str, str],
    goal_ids: list[str],
) -> httpx.Response:
    return client.put(
        f"{GOALS_PATH}/order",
        headers=headers,
        json={
            "goal_ids": goal_ids,
        },
    )


def test_reorder_daily_goals() -> None:
    unique_suffix = uuid.uuid4().hex[:8]

    headers = {
        "Authorization": f"Bearer {TEST_TOKEN}",
    }

    created_goal_ids: list[str] = []

    with httpx.Client(
        base_url=API_BASE_URL,
        timeout=15.0,
    ) as client:
        try:
            goal_1 = create_goal(
                client,
                headers,
                name=f"[TEST {unique_suffix}] Goal 1",
                period="daily",
            )
            created_goal_ids.append(goal_1["id"])

            goal_2 = create_goal(
                client,
                headers,
                name=f"[TEST {unique_suffix}] Goal 2",
                period="daily",
            )
            created_goal_ids.append(goal_2["id"])

            goal_3 = create_goal(
                client,
                headers,
                name=f"[TEST {unique_suffix}] Goal 3",
                period="daily",
            )
            created_goal_ids.append(goal_3["id"])

            response = reorder_goals(
                client,
                headers,
                [
                    goal_3["id"],
                    goal_1["id"],
                    goal_2["id"],
                ],
            )

            assert response.status_code == 204, response.text

        finally:
            for goal_id in created_goal_ids:
                archive_goal(
                    client,
                    headers,
                    goal_id,
                )
            response = client.get(
                GOALS_PATH,
                headers=headers,
            )

            assert response.status_code == 200, response.text

            goals = response.json()
            test_goals = [goal for goal in goals if goal["id"] in created_goal_ids]
            assert [goal["id"] for goal in test_goals] == [
                goal_3["id"],
                goal_1["id"],
                goal_2["id"],
            ]
            assert [goal["position"] for goal in test_goals] == [
                0,
                1,
                2,
            ]


def test_cannot_reorder_goals_from_different_periods() -> None:
    unique_suffix = uuid.uuid4().hex[:8]

    headers = {
        "Authorization": f"Bearer {TEST_TOKEN}",
    }

    created_goal_ids: list[str] = []

    with httpx.Client(
        base_url=API_BASE_URL,
        timeout=15.0,
    ) as client:
        try:
            daily_goal = create_goal(
                client,
                headers,
                name=f"[TEST {unique_suffix}] Daily",
                period="daily",
            )
            created_goal_ids.append(daily_goal["id"])

            weekly_goal = create_goal(
                client,
                headers,
                name=f"[TEST {unique_suffix}] Weekly",
                period="weekly",
            )
            created_goal_ids.append(weekly_goal["id"])

            response = reorder_goals(
                client,
                headers,
                [
                    daily_goal["id"],
                    weekly_goal["id"],
                ],
            )

            assert response.status_code == 422, response.text

        finally:
            for goal_id in created_goal_ids:
                archive_goal(
                    client,
                    headers,
                    goal_id,
                )


def test_reorder_rejects_duplicate_goal_ids() -> None:
    unique_suffix = uuid.uuid4().hex[:8]

    headers = {
        "Authorization": f"Bearer {TEST_TOKEN}",
    }

    created_goal_ids: list[str] = []

    with httpx.Client(
        base_url=API_BASE_URL,
        timeout=15.0,
    ) as client:
        try:
            goal = create_goal(
                client,
                headers,
                name=f"[TEST {unique_suffix}] Goal",
                period="daily",
            )
            created_goal_ids.append(goal["id"])

            response = reorder_goals(
                client,
                headers,
                [
                    goal["id"],
                    goal["id"],
                ],
            )

            assert response.status_code == 422, response.text

        finally:
            for goal_id in created_goal_ids:
                archive_goal(
                    client,
                    headers,
                    goal_id,
                )


def test_new_goals_are_appended_to_period() -> None:
    unique_suffix = uuid.uuid4().hex[:8]

    headers = {
        "Authorization": f"Bearer {TEST_TOKEN}",
    }

    with httpx.Client(
        base_url=API_BASE_URL,
        timeout=15.0,
    ) as client:
        try:
            goal_1 = create_goal(
                client,
                headers,
                name=f"[TEST {unique_suffix}] Goal",
                period="daily",
            )
            goal_2 = create_goal(
                client,
                headers,
                name=f"[TEST {unique_suffix}] Goal 2",
                period="daily",
            )
            assert goal_2["position"] == goal_1["position"] + 1
        finally:
            archive_goal(
                client,
                headers,
                goal_1["id"],
            )
            archive_goal(
                client,
                headers,
                goal_2["id"],
            )
