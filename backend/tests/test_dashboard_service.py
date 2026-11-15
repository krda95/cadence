from datetime import date

import pytest

from app.schemas.dashboard import DashboardActivityDayResponse
from app.schemas.progress import DayProgressResponse
from app.services.dashboard_service import (
    build_activity_data,
    calculate_streaks,
    get_activity_period_bounds,
)


def make_day(
    day: date = date(2026, 11, 2),
    daily_score: float | None = None,
    included_in_averages: bool = True,
) -> DayProgressResponse:
    return DayProgressResponse(
        date=day,
        timezone="Europe/Warsaw",
        daily_score=daily_score,
        is_final=True,
        scored_components_count=0,
        pending_components_count=0,
        components=[],
        periodic_progress=[],
        has_entries=False,
        included_in_averages=included_in_averages,
        base_score=None,
        weekly_adjustment_pp=0.0,
    )


def activity_day(
    day: date,
    score: float | None,
    included_in_averages: bool,
) -> DashboardActivityDayResponse:
    return DashboardActivityDayResponse(
        date=day,
        score=score,
        included_in_averages=included_in_averages,
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
        make_day(date(2026, 11, 2), 80.0, True),
        make_day(date(2026, 11, 4), 100.0, True),
        make_day(date(2026, 11, 5), 0.0, True),
    ]

    result = build_activity_data(
        history=history,
        date_from=date(2026, 11, 2),
        date_to=date(2026, 11, 8),
    )

    assert len(result) == 7

    assert result == [
        activity_day(date(2026, 11, 2), 80.0, True),
        activity_day(date(2026, 11, 3), None, False),
        activity_day(date(2026, 11, 4), 100.0, True),
        activity_day(date(2026, 11, 5), 0.0, True),
        activity_day(date(2026, 11, 6), None, False),
        activity_day(date(2026, 11, 7), None, False),
        activity_day(date(2026, 11, 8), None, False),
    ]


def test_build_activity_data_with_empty_history():
    result = build_activity_data(
        history=[],
        date_from=date(2026, 11, 2),
        date_to=date(2026, 11, 8),
    )

    assert len(result) == 7
    assert all(day.score is None and not day.included_in_averages for day in result)


def test_build_activity_data_ignores_dates_outside_period():
    history = [
        make_day(date(2026, 10, 31), 100.0, True),
        make_day(date(2026, 11, 3), 75.0, True),
        make_day(date(2026, 11, 10), 50.0, True),
    ]

    result = build_activity_data(
        history=history,
        date_from=date(2026, 11, 2),
        date_to=date(2026, 11, 8),
    )

    assert len(result) == 7

    scored_days = [day for day in result if day.score is not None]

    assert scored_days == [
        activity_day(date(2026, 11, 3), 75.0, True),
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
    history = [make_day(daily_score=score) for score in scores]

    current, longest = calculate_streaks(history)

    assert current == expected_current
    assert longest == expected_longest


def test_build_activity_data_preserves_pending_day_score():
    history = [
        make_day(date(2026, 11, 7), 100.0, False),
    ]

    result = build_activity_data(
        history=history,
        date_from=date(2026, 11, 7),
        date_to=date(2026, 11, 7),
    )

    assert result == [
        activity_day(date(2026, 11, 7), 100.0, False),
    ]
