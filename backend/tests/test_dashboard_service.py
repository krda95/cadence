from datetime import date

import pytest

from app.services.dashboard_service import (
    build_activity_data,
    calculate_streaks,
    get_activity_period_bounds,
)


@pytest.mark.parametrize(
    (
        "today",
        "first_goal_date",
        "offset",
        "expected_start",
        "expected_end",
        "expected_max_offset",
    ),
    [
        (
            date(2026, 11, 7),
            date(2026, 10, 20),
            0,
            date(2026, 11, 2),
            date(2026, 11, 8),
            2,
        ),
        (
            date(2026, 11, 7),
            date(2026, 10, 20),
            1,
            date(2026, 10, 26),
            date(2026, 11, 1),
            2,
        ),
        (
            date(2026, 11, 7),
            date(2026, 10, 20),
            2,
            date(2026, 10, 19),
            date(2026, 10, 25),
            2,
        ),
        (
            date(2026, 11, 7),
            None,
            0,
            date(2026, 11, 2),
            date(2026, 11, 8),
            0,
        ),
    ],
)
def test_get_activity_week_bounds(
    today,
    first_goal_date,
    offset,
    expected_start,
    expected_end,
    expected_max_offset,
):
    result = get_activity_period_bounds(
        today=today,
        first_goal_date=first_goal_date,
        period="week",
        offset=offset,
    )

    assert result == (
        expected_start,
        expected_end,
        expected_max_offset,
    )


@pytest.mark.parametrize(
    (
        "today",
        "first_goal_date",
        "offset",
        "expected_start",
        "expected_end",
        "expected_max_offset",
    ),
    [
        (
            date(2026, 11, 7),
            date(2026, 8, 15),
            0,
            date(2026, 11, 1),
            date(2026, 11, 30),
            3,
        ),
        (
            date(2026, 11, 7),
            date(2026, 8, 15),
            2,
            date(2026, 9, 1),
            date(2026, 9, 30),
            3,
        ),
        (
            date(2026, 1, 15),
            date(2025, 11, 10),
            1,
            date(2025, 12, 1),
            date(2025, 12, 31),
            2,
        ),
        (
            date(2024, 3, 10),
            date(2024, 1, 1),
            1,
            date(2024, 2, 1),
            date(2024, 2, 29),
            2,
        ),
        (
            date(2026, 3, 10),
            date(2026, 1, 1),
            1,
            date(2026, 2, 1),
            date(2026, 2, 28),
            2,
        ),
    ],
)
def test_get_activity_month_bounds(
    today,
    first_goal_date,
    offset,
    expected_start,
    expected_end,
    expected_max_offset,
):
    result = get_activity_period_bounds(
        today=today,
        first_goal_date=first_goal_date,
        period="month",
        offset=offset,
    )

    assert result == (
        expected_start,
        expected_end,
        expected_max_offset,
    )


@pytest.mark.parametrize(
    ("period", "offset"),
    [
        ("week", -1),
        ("month", -1),
        ("week", 3),
        ("month", 2),
    ],
)
def test_get_activity_bounds_rejects_invalid_offset(period, offset):
    with pytest.raises(ValueError):
        get_activity_period_bounds(
            today=date(2026, 11, 7),
            first_goal_date=date(2026, 10, 20),
            period=period,
            offset=offset,
        )


def test_get_activity_bounds_rejects_unsupported_period():
    with pytest.raises(ValueError):
        get_activity_period_bounds(
            today=date(2026, 11, 7),
            first_goal_date=None,
            period="year",
            offset=0,
        )


def test_get_activity_bounds_rejects_previous_period_without_goals():
    with pytest.raises(ValueError):
        get_activity_period_bounds(
            today=date(2026, 11, 7),
            first_goal_date=None,
            period="week",
            offset=1,
        )


def test_build_activity_data_maps_scores_to_dates():
    history = [
        {"date": date(2026, 11, 2), "daily_score": 80.0},
        {"date": date(2026, 11, 4), "daily_score": 100.0},
        {"date": date(2026, 11, 5), "daily_score": 0.0},
    ]

    result = build_activity_data(
        history=history,
        date_from=date(2026, 11, 2),
        date_to=date(2026, 11, 8),
    )

    assert len(result) == 7

    assert result == [
        {"date": date(2026, 11, 2), "score": 80.0},
        {"date": date(2026, 11, 3), "score": None},
        {"date": date(2026, 11, 4), "score": 100.0},
        {"date": date(2026, 11, 5), "score": 0.0},
        {"date": date(2026, 11, 6), "score": None},
        {"date": date(2026, 11, 7), "score": None},
        {"date": date(2026, 11, 8), "score": None},
    ]


def test_build_activity_data_with_empty_history():
    result = build_activity_data(
        history=[],
        date_from=date(2026, 11, 2),
        date_to=date(2026, 11, 8),
    )

    assert len(result) == 7
    assert all(day["score"] is None for day in result)


def test_build_activity_data_ignores_dates_outside_period():
    history = [
        {"date": date(2026, 10, 31), "daily_score": 100.0},
        {"date": date(2026, 11, 3), "daily_score": 75.0},
        {"date": date(2026, 11, 10), "daily_score": 50.0},
    ]

    result = build_activity_data(
        history=history,
        date_from=date(2026, 11, 2),
        date_to=date(2026, 11, 8),
    )

    assert len(result) == 7

    scored_days = [day for day in result if day["score"] is not None]

    assert scored_days == [
        {"date": date(2026, 11, 3), "score": 75.0},
    ]


@pytest.mark.parametrize(
    ("scores", "expected_current", "expected_longest"),
    [
        ([], 0, 0),
        ([100], 1, 1),
        ([90], 0, 0),
        ([90.01], 1, 1),
        ([100, 100, 100], 3, 3),
        ([100, 100, 50], 0, 2),
        ([100, 100, 50, 100], 1, 2),
        ([100, None, 100], 1, 1),
        ([100, 0, 100], 1, 1),
        ([100, 100, 50, 100, 100, 100], 3, 3),
    ],
)
def test_calculate_streaks(
    scores,
    expected_current,
    expected_longest,
):
    history = [{"daily_score": score} for score in scores]

    current, longest = calculate_streaks(history)

    assert current == expected_current
    assert longest == expected_longest
