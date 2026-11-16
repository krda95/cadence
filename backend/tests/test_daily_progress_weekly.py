import uuid
from datetime import date

from app.models.enums import GoalPeriod, GoalTargetType
from app.models.goal import Goal
from app.schemas.progress import DailyProgressResponse
from app.services.progress_service import GoalDayState, build_daily_progress

REFERENCE_DATE = date(2026, 11, 11)
TODAY = date(2026, 11, 12)  # reference day is already finished


def make_goal(
    period: GoalPeriod,
    target_type: GoalTargetType,
    target_value: float,
) -> Goal:
    return Goal(
        id=uuid.uuid4(),
        owner_id=uuid.uuid4(),
        name="Goal",
        unit="unit",
        period=period,
        target_type=target_type,
        target_value=target_value,
    )


def daily_min_state(entry_value: float, target_value: float) -> GoalDayState:
    goal = make_goal(GoalPeriod.DAILY, GoalTargetType.MIN, target_value)
    return GoalDayState(
        goal=goal,
        entry_value=entry_value,
        entry_note=None,
        period_current_value=entry_value,
    )


def weekly_state(
    target_type: GoalTargetType,
    target_value: float,
    entry_value: float | None,
    period_total: float,
) -> GoalDayState:
    goal = make_goal(GoalPeriod.WEEKLY, target_type, target_value)
    return GoalDayState(
        goal=goal,
        entry_value=entry_value,
        entry_note=None,
        period_current_value=period_total,
    )


def build(states: list[GoalDayState]) -> DailyProgressResponse:
    return build_daily_progress(
        goal_states=states,
        reference_date=REFERENCE_DATE,
        today=TODAY,
    )


def test_weekly_max_exceeded_counts_as_zero_in_average() -> None:
    result = build(
        [
            daily_min_state(entry_value=10, target_value=10),
            weekly_state(GoalTargetType.MAX, 2, entry_value=2, period_total=3),
        ]
    )

    assert result.base_score == 50.0
    assert result.weekly_adjustment_pp == 0.0
    assert result.daily_score == 50.0
    assert result.scored_components_count == 2
    weekly_component = result.components[1]
    assert weekly_component.score == 0.0
    assert weekly_component.included_in_daily_score is True


def test_weekly_max_still_exceeded_next_day_stays_zero() -> None:
    result = build(
        [
            daily_min_state(entry_value=10, target_value=10),
            weekly_state(GoalTargetType.MAX, 2, entry_value=1, period_total=4),
        ]
    )

    assert result.base_score == 50.0
    assert result.weekly_adjustment_pp == 0.0


def test_weekly_max_within_limit_is_still_minus_five() -> None:
    result = build(
        [
            daily_min_state(entry_value=10, target_value=10),
            weekly_state(GoalTargetType.MAX, 2, entry_value=1, period_total=1),
        ]
    )

    assert result.scored_components_count == 1
    assert result.base_score == 100.0
    assert result.weekly_adjustment_pp == -5.0
    assert result.daily_score == 95.0


def test_weekly_min_reached_counts_as_hundred() -> None:
    result = build(
        [
            daily_min_state(entry_value=5, target_value=10),
            weekly_state(GoalTargetType.MIN, 4, entry_value=1, period_total=4),
        ]
    )

    assert result.base_score == 75.0
    assert result.weekly_adjustment_pp == 0.0


def test_weekly_without_entry_does_nothing() -> None:
    result = build(
        [
            daily_min_state(entry_value=10, target_value=10),
            weekly_state(GoalTargetType.MAX, 2, entry_value=None, period_total=5),
        ]
    )

    assert result.scored_components_count == 1
    assert result.weekly_adjustment_pp == 0.0
    assert result.daily_score == 100.0


def test_exceeded_only_component_gives_zero_score() -> None:
    result = build(
        [weekly_state(GoalTargetType.MAX, 2, entry_value=2, period_total=3)]
    )

    assert result.daily_score == 0.0


def test_crossed_goals_do_not_use_up_the_ten_point_cap() -> None:
    states = [daily_min_state(entry_value=8, target_value=10)]
    for _ in range(3):
        states.append(
            weekly_state(GoalTargetType.MIN, 4, entry_value=1, period_total=1)
        )
    states.append(weekly_state(GoalTargetType.MIN, 4, entry_value=1, period_total=4))

    result = build(states)

    assert result.base_score == 90.0
    assert result.weekly_adjustment_pp == 10.0
    assert result.daily_score == 100.0


def test_removing_earlier_entry_brings_back_adjustment() -> None:
    result = build(
        [
            daily_min_state(entry_value=10, target_value=10),
            weekly_state(GoalTargetType.MAX, 2, entry_value=1, period_total=2),
        ]
    )

    assert result.weekly_adjustment_pp == -5.0
    assert result.scored_components_count == 1
