import pytest
from pydantic import ValidationError

from app.models.enums import GoalPeriod, GoalQuickActionType, GoalTargetType
from app.schemas.goal import GoalCreate, validate_goal_quick_action


@pytest.mark.parametrize(
    ("period", "target_type", "quick_action_type", "quick_action_step"),
    [
        (GoalPeriod.DAILY, GoalTargetType.MIN, GoalQuickActionType.NONE, None),
        (GoalPeriod.DAILY, GoalTargetType.MIN, GoalQuickActionType.CHECK, None),
        (GoalPeriod.DAILY, GoalTargetType.MIN, GoalQuickActionType.INCREMENT, 1_000),
        (GoalPeriod.DAILY, GoalTargetType.MAX, GoalQuickActionType.INCREMENT, 1),
        (GoalPeriod.WEEKLY, GoalTargetType.MIN, GoalQuickActionType.INCREMENT, 0.5),
        (GoalPeriod.WEEKLY, GoalTargetType.MAX, GoalQuickActionType.INCREMENT, 1),
        (GoalPeriod.WEEKLY, GoalTargetType.MIN, GoalQuickActionType.NONE, None),
    ],
)
def test_validate_goal_quick_action_accepts_valid_combinations(
    period: GoalPeriod,
    target_type: GoalTargetType,
    quick_action_type: GoalQuickActionType,
    quick_action_step: float | None,
) -> None:
    validate_goal_quick_action(
        period=period,
        target_type=target_type,
        quick_action_type=quick_action_type,
        quick_action_step=quick_action_step,
    )


@pytest.mark.parametrize(
    ("period", "target_type", "quick_action_type", "quick_action_step", "message"),
    [
        (
            GoalPeriod.DAILY,
            GoalTargetType.MAX,
            GoalQuickActionType.CHECK,
            None,
            "daily min",
        ),
        (
            GoalPeriod.WEEKLY,
            GoalTargetType.MIN,
            GoalQuickActionType.CHECK,
            None,
            "daily min",
        ),
        (
            GoalPeriod.WEEKLY,
            GoalTargetType.MAX,
            GoalQuickActionType.CHECK,
            None,
            "daily min",
        ),
        (
            GoalPeriod.DAILY,
            GoalTargetType.MIN,
            GoalQuickActionType.INCREMENT,
            None,
            "step",
        ),
        (
            GoalPeriod.DAILY,
            GoalTargetType.MIN,
            GoalQuickActionType.INCREMENT,
            0,
            "step",
        ),
        (
            GoalPeriod.WEEKLY,
            GoalTargetType.MIN,
            GoalQuickActionType.INCREMENT,
            -1,
            "step",
        ),
    ],
)
def test_validate_goal_quick_action_rejects_invalid_combinations(
    period: GoalPeriod,
    target_type: GoalTargetType,
    quick_action_type: GoalQuickActionType,
    quick_action_step: float | None,
    message: str,
) -> None:
    with pytest.raises(ValueError, match=message):
        validate_goal_quick_action(
            period=period,
            target_type=target_type,
            quick_action_type=quick_action_type,
            quick_action_step=quick_action_step,
        )


def build_goal(**overrides) -> GoalCreate:
    data = {
        "name": "Test goal",
        "unit": "steps",
        "period": GoalPeriod.DAILY,
        "target_type": GoalTargetType.MIN,
        "target_value": 10_000,
    }
    data.update(overrides)
    return GoalCreate(**data)


def test_goal_create_defaults_to_no_quick_action() -> None:
    goal = build_goal()

    assert goal.quick_action_type == GoalQuickActionType.NONE
    assert goal.quick_action_step is None


def test_goal_create_accepts_fractional_increment_step() -> None:
    goal = build_goal(
        period=GoalPeriod.WEEKLY,
        quick_action_type=GoalQuickActionType.INCREMENT,
        quick_action_step=0.5,
    )

    assert goal.quick_action_step == 0.5


def test_goal_create_rejects_check_for_weekly_goal() -> None:
    with pytest.raises(ValidationError):
        build_goal(
            period=GoalPeriod.WEEKLY,
            quick_action_type=GoalQuickActionType.CHECK,
        )


def test_goal_create_rejects_increment_without_step() -> None:
    with pytest.raises(ValidationError):
        build_goal(quick_action_type=GoalQuickActionType.INCREMENT)


@pytest.mark.parametrize(
    ("step"),
    [0, -1, -10, -3.14, None],
)
def test_goal_create_rejects_non_positive_step(step: float | None) -> None:
    with pytest.raises(ValidationError):
        build_goal(
            quick_action_type=GoalQuickActionType.INCREMENT,
            quick_action_step=step,
        )
