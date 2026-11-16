import pytest

from app.models.enums import GoalTargetType, ProgressStatus
from app.services.progress_rules import (
    calculate_average_score,
    calculate_daily_max_result,
    calculate_daily_min_result,
    calculate_daily_score,
    calculate_max_score,
    calculate_min_score,
    calculate_period_score,
    calculate_weekly_entry_effect,
    calculate_weekly_score,
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
    ],
)
def test_calculate_min_score(
    current_value: float,
    target_value: float,
    expected_score: float,
) -> None:
    assert (
        calculate_min_score(
            current_value=current_value,
            target_value=target_value,
        )
        == expected_score
    )


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
    assert (
        calculate_max_score(
            current_value=current_value,
            target_value=target_value,
        )
        == expected_score
    )


def test_daily_min_without_entry_today_is_pending() -> None:
    result = calculate_daily_min_result(
        entry_value=None,
        target_value=10_000,
        is_day_final=False,
    )

    assert result.score is None
    assert result.status == ProgressStatus.PENDING
    assert result.included_in_daily_score is False


def test_daily_min_without_entry_after_day_end_is_missed() -> None:
    result = calculate_daily_min_result(
        entry_value=0,
        target_value=10_000,
        is_day_final=True,
    )

    assert result.score == 0.0
    assert result.status == ProgressStatus.MISSED
    assert result.included_in_daily_score is True


def test_daily_min_is_scored_proportionally() -> None:
    result = calculate_daily_min_result(
        entry_value=7_500,
        target_value=10_000,
        is_day_final=True,
    )

    assert result.score == 75.0
    assert result.status == ProgressStatus.PARTIALLY_ACHIEVED
    assert result.included_in_daily_score is True


def test_daily_min_is_achieved_when_target_is_reached() -> None:
    result = calculate_daily_min_result(
        entry_value=12_000,
        target_value=10_000,
        is_day_final=True,
    )

    assert result.score == 100.0
    assert result.status == ProgressStatus.ACHIEVED
    assert result.included_in_daily_score is True


def test_daily_max_without_entry_after_day_end_is_achieved() -> None:
    result = calculate_daily_max_result(
        entry_value=None,
        target_value=2,
        is_day_final=True,
    )

    assert result.score == 100.0
    assert result.status == ProgressStatus.ACHIEVED
    assert result.included_in_daily_score is True


def test_daily_max_without_entry_today_is_pending() -> None:
    result = calculate_daily_max_result(
        entry_value=None,
        target_value=2,
        is_day_final=False,
    )

    assert result.score is None
    assert result.status == ProgressStatus.PENDING
    assert result.included_in_daily_score is False


def test_daily_max_limit_exceeded_gives_zero_points() -> None:
    result = calculate_daily_max_result(
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
    assert (
        causes_period_max_daily_penalty(
            entry_value_for_day=entry_value_for_day,
            total_before_day=total_before_day,
            target_value=target_value,
        )
        is expected_penalty
    )


@pytest.mark.parametrize(
    (
        "target_type",
        "current_value",
        "target_value",
        "expected_score",
    ),
    [
        # Weekly MIN: 2 workouts out of 4 = 50%.
        (GoalTargetType.MIN, 2, 4, 50.0),
        # Weekly MIN: target reached.
        (GoalTargetType.MIN, 4, 4, 100.0),
        # Weekly MIN: above the target remains 100%.
        (GoalTargetType.MIN, 5, 4, 100.0),
        # Weekly MAX: 50% of the limit
        (GoalTargetType.MAX, 1, 2, 100.0),
        # Weekly MAX: within the limit.
        (GoalTargetType.MAX, 2, 2, 100.0),
        # Weekly MAX: limit exceeded.
        (GoalTargetType.MAX, 3, 2, 0.0),
    ],
)
def test_calculate_final_period_score(
    target_type: GoalTargetType,
    current_value: float,
    target_value: float,
    expected_score: float,
) -> None:
    assert (
        calculate_period_score(
            target_type=target_type,
            current_value=current_value,
            target_value=target_value,
        )
        == expected_score
    )


def test_daily_goal_contributes_one_weekly_average() -> None:
    """
    One daily goal must contribute once to weekly_score,
    even though it has seven daily values.

    100 + 50 + 0 + 100 + 100 + 0 + 100 = 450
    450 / 7 = 64.29
    """
    daily_scores = [100.0, 50.0, 0.0, 100.0, 100.0, 0.0, 100.0]

    assert calculate_average_score(daily_scores) == 64.29


def test_weekly_score_weights_each_goal_equally() -> None:
    """
    Daily goal average: 85
    Daily goal average: 100
    Weekly MIN goal: 50
    Weekly MAX goal: 0

    (85 + 100 + 50 + 0) / 4 = 58.75
    """
    goal_scores = [85.0, 100.0, 50.0, 0.0]

    assert (
        calculate_weekly_score(
            goal_scores=goal_scores,
            is_week_final=True,
        )
        == 58.75
    )


def test_weekly_score_is_not_final_before_sunday_ends() -> None:
    assert (
        calculate_weekly_score(
            goal_scores=[85.0, 100.0, 50.0, 0.0],
            is_week_final=False,
        )
        is None
    )


def test_weekly_score_without_eligible_goals_is_none() -> None:
    assert (
        calculate_weekly_score(
            goal_scores=[],
            is_week_final=True,
        )
        is None
    )


@pytest.mark.parametrize(
    ("target_type", "entry_value", "period_total", "target_value", "adjustment", "component"),
    [
        (GoalTargetType.MIN, 0, 0, 4, 0.0, None),
        (GoalTargetType.MIN, 1, 1, 4, 5.0, None),
        (GoalTargetType.MIN, 3, 3, 4, 5.0, None),
        (GoalTargetType.MIN, 1, 4, 4, 0.0, 100.0),
        (GoalTargetType.MIN, 1, 6, 4, 0.0, 100.0),
        (GoalTargetType.MAX, 0, 3, 2, 0.0, None),
        (GoalTargetType.MAX, 1, 1, 2, -5.0, None),
        (GoalTargetType.MAX, 1, 2, 2, -5.0, None),
        (GoalTargetType.MAX, 1, 3, 2, 0.0, 0.0),
        (GoalTargetType.MAX, 1, 5, 2, 0.0, 0.0),
    ],
)
def test_weekly_entry_effect(
    target_type: GoalTargetType,
    entry_value: float,
    period_total: float,
    target_value: float,
    adjustment: float,
    component: float | None,
) -> None:
    effect = calculate_weekly_entry_effect(
        target_type=target_type,
        entry_value=entry_value,
        period_total=period_total,
        target_value=target_value,
    )

    assert effect.adjustment_pp == adjustment
    assert effect.component_score == component


@pytest.mark.parametrize(
    ("daily_scores", "adjustments", "base", "adjustment", "score"),
    [
        ([], [], 100.0, 0.0, 100.0),
        ([80.0, 60.0], [], 70.0, 0.0, 70.0),
        ([80.0, 100.0], [], 90.0, 0.0, 90.0),
        ([], [5.0], 100.0, 5.0, 100.0),
        ([], [-5.0], 100.0, -5.0, 95.0),
        ([], [5.0, -5.0], 100.0, 0.0, 100.0),
        ([70.0], [5.0, 5.0, 5.0], 70.0, 10.0, 80.0),
        ([70.0], [-5.0, -5.0, -5.0], 70.0, -10.0, 60.0),
        ([70.0], [5.0, 5.0, 5.0, -5.0], 70.0, 10.0, 80.0),
        ([0.0], [-5.0], 0.0, -5.0, 0.0),
        ([98.0], [5.0], 98.0, 5.0, 100.0),
    ],
)
def test_daily_score(
    daily_scores: list[float],
    adjustments: list[float],
    base: float,
    adjustment: float,
    score: float,
) -> None:
    result = calculate_daily_score(
        daily_scores=daily_scores,
        weekly_adjustments=adjustments,
    )

    assert result.base_score == base
    assert result.weekly_adjustment_pp == adjustment
    assert result.daily_score == score


def test_daily_max_explicit_zero_today_is_scored() -> None:
    result = calculate_daily_max_result(
        entry_value=0,
        target_value=2,
        is_day_final=False,
    )

    assert result.score == 100.0
    assert result.status == ProgressStatus.IN_PROGRESS
    assert result.included_in_daily_score is True


@pytest.mark.parametrize("target_value", [0, -1])
def test_min_score_rejects_non_positive_target(
    target_value: float,
) -> None:
    with pytest.raises(
        ValueError,
        match="Minimum goal target must be greater than zero",
    ):
        calculate_min_score(
            current_value=1,
            target_value=target_value,
        )
