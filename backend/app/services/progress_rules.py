from dataclasses import dataclass

from app.models.enums import GoalTargetType, ProgressStatus

WEEKLY_MIN_BONUS_PP = 5.0
WEEKLY_MAX_PENALTY_PP = -5.0
WEEKLY_ADJUSTMENT_LIMIT_PP = 10.0


@dataclass(frozen=True)
class ScoreResult:
    score: float | None
    status: ProgressStatus
    included_in_daily_score: bool


@dataclass(frozen=True)
class WeeklyEntryEffect:
    adjustment_pp: float  # +5.0, -5.0 or 0.0
    component_score: float | None  # 0.0 / 100.0 once the threshold is crossed


@dataclass(frozen=True)
class DailyScoreResult:
    base_score: float
    weekly_adjustment_pp: float
    daily_score: float


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
    if target_value <= 0:
        raise ValueError("Minimum goal target must be greater than zero")

    progress_percent = (current_value / target_value) * 100

    if progress_percent > 100.0:
        return 100.0

    return progress_percent


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
    entry_value: float | None,
    target_value: float,
    is_day_final: bool,
) -> ScoreResult:
    """
    Daily MIN:
    - brak wpisu dziś -> pending, nie wpływa jeszcze na wynik dnia;
    - brak wpisu w zakończonym dniu -> 0%, missed;
    - wpis istnieje -> wynik proporcjonalny.
    """
    if entry_value is None and not is_day_final:
        return ScoreResult(
            score=None,
            status=ProgressStatus.PENDING,
            included_in_daily_score=False,
        )

    current_value = entry_value if entry_value is not None else 0.0
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
    entry_value: float | None,
    target_value: float,
    is_day_final: bool,
) -> ScoreResult:
    """
    Daily MAX:
    - brak wpisu w trwającym dniu -> pending, poza bazą dnia;
    - brak wpisu w zakończonym dniu -> achieved, 100%;
    - zapisany wpis w limicie -> 100%;
    - przekroczenie limitu -> 0%.
    """
    if entry_value is None and not is_day_final:
        return ScoreResult(
            score=None,
            status=ProgressStatus.PENDING,
            included_in_daily_score=False,
        )
    current_value = entry_value if entry_value is not None else 0.0
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

    return entry_value_for_day > 0 and total_after_day > target_value


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


def calculate_weekly_entry_effect(
    target_type: GoalTargetType,
    entry_value: float,
    period_total: float,
    target_value: float,
) -> WeeklyEntryEffect:
    """
    What a single day's entry of a weekly goal does to the daily score.

    period_total is the week total up to and including this day.

    Step 1: no positive entry -> nothing happens.
    Step 2: MIN goal
      - target reached (total >= target) -> counts as 100% in the average
      - otherwise -> +5 p.p. bonus
    Step 3: MAX goal
      - limit exceeded (total > limit) -> counts as 0% in the average
      - otherwise (also exactly at the limit) -> -5 p.p. penalty
    """
    if entry_value <= 0:
        return WeeklyEntryEffect(adjustment_pp=0.0, component_score=None)

    if target_type == GoalTargetType.MIN:
        if period_total >= target_value:
            return WeeklyEntryEffect(adjustment_pp=0.0, component_score=100.0)
        return WeeklyEntryEffect(
            adjustment_pp=WEEKLY_MIN_BONUS_PP,
            component_score=None,
        )

    if period_total > target_value:
        return WeeklyEntryEffect(adjustment_pp=0.0, component_score=0.0)
    return WeeklyEntryEffect(
        adjustment_pp=WEEKLY_MAX_PENALTY_PP,
        component_score=None,
    )


def calculate_daily_score(
    daily_scores: list[float],
    weekly_adjustments: list[float],
) -> DailyScoreResult:
    """
    Calculates the final daily score, including weekly adjustments.
    - base_score: average of daily scores for all goals, including weekly goals
      that crossed their threshold (0% or 100%);
    - weekly_adjustment_pp: sum of weekly adjustments, limited to ±10 p.p.;
    - daily_score: base_score + weekly_adjustment_pp, limited to 0-100
    """
    base_score = sum(daily_scores) / len(daily_scores) if daily_scores else 100.0

    weekly_adjustment_pp = sum(weekly_adjustments)

    if weekly_adjustment_pp > WEEKLY_ADJUSTMENT_LIMIT_PP:
        weekly_adjustment_pp = WEEKLY_ADJUSTMENT_LIMIT_PP
    elif weekly_adjustment_pp < -WEEKLY_ADJUSTMENT_LIMIT_PP:
        weekly_adjustment_pp = -WEEKLY_ADJUSTMENT_LIMIT_PP

    daily_score = base_score + weekly_adjustment_pp

    if daily_score > 100.0:
        daily_score = 100.0
    elif daily_score < 0.0:
        daily_score = 0.0

    return DailyScoreResult(
        base_score=round(base_score, 2),
        weekly_adjustment_pp=round(weekly_adjustment_pp, 2),
        daily_score=round(daily_score, 2),
    )
