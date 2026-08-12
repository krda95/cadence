from dataclasses import dataclass

from app.models.enums import GoalTargetType, ProgressStatus


@dataclass(frozen=True)
class ScoreResult:
    score: float | None
    status: ProgressStatus
    included_in_daily_score: bool


def calculate_min_score(
    current_value: float,
    target_value: float,
) -> float:
    """
    Minimum target:
    - 0 / 10 000 -> 0%
    - 5 000 / 10 000 -> 50%
    - 12 000 / 10 000 -> 100%
    """
    if target_value == 0:
        return 100.0

    return min((current_value / target_value) * 100, 100.0)


def calculate_max_score(
    current_value: float,
    target_value: float,
) -> float:
    """
    Maximum target:
    - value <= target -> 100%
    - value > target -> 0%
    """
    return 100.0 if current_value <= target_value else 0.0


def calculate_daily_min_result(
    entry_exists: bool,
    entry_value: float,
    target_value: float,
    is_day_final: bool,
) -> ScoreResult:
    """
    Daily MIN:
    - brak wpisu dziś -> pending, nie wpływa jeszcze na wynik dnia;
    - brak wpisu w zakończonym dniu -> 0%, missed;
    - wpis istnieje -> wynik proporcjonalny.
    """
    if not entry_exists and not is_day_final:
        return ScoreResult(
            score=None,
            status=ProgressStatus.PENDING,
            included_in_daily_score=False,
        )

    current_value = entry_value if entry_exists else 0.0
    score = calculate_min_score(
        current_value=current_value,
        target_value=target_value,
    )

    if current_value >= target_value:
        status = ProgressStatus.ACHIEVED
    elif current_value == 0:
        status = ProgressStatus.MISSED
    else:
        status = ProgressStatus.PARTIALLY_ACHIEVED

    return ScoreResult(
        score=score,
        status=status,
        included_in_daily_score=True,
    )


def calculate_daily_max_result(
    entry_exists: bool,
    entry_value: float,
    target_value: float,
    is_day_final: bool,
) -> ScoreResult:
    """
    Daily MAX:
    - brak wpisu oznacza wartość 0;
    - brak wpisu w zakończonym dniu = achieved, 100%;
    - przekroczenie limitu = 0%.
    """
    current_value = entry_value if entry_exists else 0.0
    score = calculate_max_score(
        current_value=current_value,
        target_value=target_value,
    )

    if current_value > target_value:
        status = ProgressStatus.EXCEEDED
    elif is_day_final:
        status = ProgressStatus.ACHIEVED
    else:
        status = ProgressStatus.IN_PROGRESS

    return ScoreResult(
        score=score,
        status=status,
        included_in_daily_score=True,
    )


def causes_period_max_daily_penalty(
    entry_value_for_day: float,
    total_before_day: float,
    target_value: float,
) -> bool:
    """
    Weekly/monthly MAX obniża daily score tylko wtedy, gdy:
    - użytkownik dodał dodatnią wartość danego dnia;
    - po dodaniu tej wartości suma okresu przekracza limit.

    Jeśli limit przekroczono wcześniej, ale dziś nie ma wpisu,
    dzisiejszy wynik nie dostaje dodatkowej kary.
    """
    total_after_day = total_before_day + entry_value_for_day

    return (
        entry_value_for_day > 0
        and total_after_day > target_value
    )

def calculate_period_score(
    target_type: GoalTargetType,
    current_value: float,
    target_value: float,
) -> float:
    """
    Calculates the final score for a completed weekly or monthly goal.
    MIN:
    - proportional score, maximum 100
    MAX:
    - 100 while within the limit
    - 0 after exceeding the limit
    """
    if target_type == GoalTargetType.MIN:
        return calculate_min_score(
            current_value=current_value,
            target_value=target_value,
        )

    return calculate_max_score(
        current_value=current_value,
        target_value=target_value,
    )

def calculate_average_score(scores: list[float]) -> float | None:
    """
    Returns an equally weighted average of goal scores.
    Every goal contributes once:
    - a daily goal contributes its weekly daily-score average;
    - a weekly goal contributes its final weekly score.
    """
    if not scores:
        return None
    return round(sum(scores) / len(scores), 2)

def calculate_weekly_score(
    goal_scores: list[float],
    is_week_final: bool,
) -> float | None:
    """
    Official weekly score exists only after the week is finished.
    """
    if not is_week_final:
        return None
    return calculate_average_score(goal_scores)