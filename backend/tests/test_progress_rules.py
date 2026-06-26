import pytest

from app.models.enums import ProgressStatus
from app.services.progress_rules import (
    calculate_daily_max_result,
    calculate_daily_min_result,
    calculate_max_score,
    calculate_min_score,
    causes_period_max_daily_penalty,
)


@pytest.mark.parametrize(
    ("current_value", "target_value", "expected_score"),
    [
        (0, 10_000, 0.0),
        (2_500, 10_000, 25.0),
        (5_000, 10_000, 50.0),
        (10_000, 10_000, 100.0),
        (12_000, 10_000, 100.0),
        (0, 0, 100.0),
    ],
)
def test_calculate_min_score(
    current_value: float,
    target_value: float,
    expected_score: float,
) -> None:
    assert calculate_min_score(
        current_value=current_value,
        target_value=target_value,
    ) == expected_score


@pytest.mark.parametrize(
    ("current_value", "target_value", "expected_score"),
    [
        (0, 2_200, 100.0),
        (1_900, 2_200, 100.0),
        (2_200, 2_200, 100.0),
        (2_201, 2_200, 0.0),
        (3_000, 2_200, 0.0),
        (0, 0, 100.0),
        (1, 0, 0.0),
    ],
)
def test_calculate_max_score(
    current_value: float,
    target_value: float,
    expected_score: float,
) -> None:
    assert calculate_max_score(
        current_value=current_value,
        target_value=target_value,
    ) == expected_score


def test_daily_min_without_entry_today_is_pending() -> None:
    result = calculate_daily_min_result(
        entry_exists=False,
        entry_value=0,
        target_value=10_000,
        is_day_final=False,
    )

    assert result.score is None
    assert result.status == ProgressStatus.PENDING
    assert result.included_in_daily_score is False


def test_daily_min_without_entry_after_day_end_is_missed() -> None:
    result = calculate_daily_min_result(
        entry_exists=False,
        entry_value=0,
        target_value=10_000,
        is_day_final=True,
    )

    assert result.score == 0.0
    assert result.status == ProgressStatus.MISSED
    assert result.included_in_daily_score is True


def test_daily_min_is_scored_proportionally() -> None:
    result = calculate_daily_min_result(
        entry_exists=True,
        entry_value=7_500,
        target_value=10_000,
        is_day_final=True,
    )

    assert result.score == 75.0
    assert result.status == ProgressStatus.PARTIALLY_ACHIEVED
    assert result.included_in_daily_score is True


def test_daily_min_is_achieved_when_target_is_reached() -> None:
    result = calculate_daily_min_result(
        entry_exists=True,
        entry_value=12_000,
        target_value=10_000,
        is_day_final=True,
    )

    assert result.score == 100.0
    assert result.status == ProgressStatus.ACHIEVED
    assert result.included_in_daily_score is True


def test_daily_max_without_entry_after_day_end_is_achieved() -> None:
    result = calculate_daily_max_result(
        entry_exists=False,
        entry_value=0,
        target_value=2,
        is_day_final=True,
    )

    assert result.score == 100.0
    assert result.status == ProgressStatus.ACHIEVED
    assert result.included_in_daily_score is True


def test_daily_max_without_entry_today_is_in_progress() -> None:
    result = calculate_daily_max_result(
        entry_exists=False,
        entry_value=0,
        target_value=2,
        is_day_final=False,
    )

    assert result.score == 100.0
    assert result.status == ProgressStatus.IN_PROGRESS
    assert result.included_in_daily_score is True


def test_daily_max_limit_exceeded_gives_zero_points() -> None:
    result = calculate_daily_max_result(
        entry_exists=True,
        entry_value=3,
        target_value=2,
        is_day_final=False,
    )

    assert result.score == 0.0
    assert result.status == ProgressStatus.EXCEEDED
    assert result.included_in_daily_score is True


@pytest.mark.parametrize(
    (
        "entry_value_for_day",
        "total_before_day",
        "target_value",
        "expected_penalty",
    ),
    [
        # W limicie: brak kary.
        (1, 0, 2, False),
        (1, 1, 2, False),

        # Środa: 1 wcześniej + 2 dziś = 3, limit 2 -> kara.
        (2, 1, 2, True),

        # Limit przekroczony wcześniej, ale dziś brak wpisu -> bez kary.
        (0, 3, 2, False),

        # Limit przekroczony wcześniej, ale dziś kolejny drink -> kolejna kara.
        (1, 3, 2, True),

        # Limit 0: każdy dodatni wpis daje karę.
        (1, 0, 0, True),

        # Limit 0: brak wpisu nie daje kary.
        (0, 0, 0, False),
    ],
)
def test_period_max_penalty_only_applies_on_the_day_of_positive_entry(
    entry_value_for_day: float,
    total_before_day: float,
    target_value: float,
    expected_penalty: bool,
) -> None:
    assert causes_period_max_daily_penalty(
        entry_value_for_day=entry_value_for_day,
        total_before_day=total_before_day,
        target_value=target_value,
    ) is expected_penalty