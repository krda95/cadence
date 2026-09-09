from collections import defaultdict
from datetime import date, datetime, timedelta
import os
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import goal
from app.models.goal import Goal, GoalPeriod, GoalTargetType
from app.models.goal_entry import GoalEntry
from app.models.enums import (
    ProgressStatus,
)
from app.schemas.goal_entry import GoalEntryDayResponse
from app.services.progress_rules import (
    calculate_daily_max_result,
    calculate_daily_min_result,
    calculate_max_score,
    calculate_min_score,
    causes_period_max_daily_penalty,
    calculate_weekly_score,
    calculate_average_score,
    calculate_period_score,
)
from dataclasses import dataclass

WARSAW_TIMEZONE = ZoneInfo("Europe/Warsaw")
TIMEZONE_NAME = "Europe/Warsaw"


@dataclass
class GoalDayState:
    goal: Goal
    entry_exists: bool
    entry_value: float
    entry_note: str | None
    period_current_value: float


def get_warsaw_today() -> date:
    test_today = os.getenv("CADENCE_TEST_TODAY")
    if test_today:
        try:
            return date.fromisoformat(test_today)
        except ValueError as error:
            raise RuntimeError(
                "CADENCE_TEST_TODAY must use YYYY-MM-DD format."
            ) from error
    return datetime.now(WARSAW_TIMEZONE).date()


def get_period_bounds(
    period: GoalPeriod,
    reference_date: date,
) -> tuple[date, date]:
    if period == GoalPeriod.DAILY:
        return reference_date, reference_date

    if period == GoalPeriod.WEEKLY:
        period_start = reference_date - timedelta(days=reference_date.weekday())
        period_end = period_start + timedelta(days=6)
        return period_start, period_end

    if period == GoalPeriod.MONTHLY:
        period_start = reference_date.replace(day=1)

        if reference_date.month == 12:
            next_month = reference_date.replace(
                year=reference_date.year + 1,
                month=1,
                day=1,
            )
        else:
            next_month = reference_date.replace(
                month=reference_date.month + 1,
                day=1,
            )

        period_end = next_month - timedelta(days=1)
        return period_start, period_end

    raise ValueError(f"Unsupported period: {period}")


def calculate_limit_usage_percent(
    current_value: float,
    target_value: float,
) -> float:
    # Dla limitu 0:
    # 0 / 0 oznacza brak wykorzystania limitu,
    # każda wartość dodatnia oznacza pełne wykorzystanie / przekroczenie.
    if target_value == 0:
        return 0.0 if current_value == 0 else 100.0

    return min((current_value / target_value) * 100, 100.0)


async def load_active_goals(
    session: AsyncSession,
    owner_id: UUID,
) -> list[Goal]:
    result = await session.execute(
        select(Goal)
        .where(
            Goal.owner_id == owner_id,
            Goal.is_active.is_(True),
        )
        .order_by(
            Goal.position.asc(),
            Goal.created_at.asc(),
        )
    )

    return list(result.scalars().all())


@dataclass
class GoalEntryDay:
    value: float
    note: str | None


async def load_entries_by_goal(
    session: AsyncSession, goal_ids: list[UUID], date_from: date, date_to: date
) -> dict[UUID, dict[date, GoalEntryDay]]:
    if not goal_ids:
        return {}

    result = await session.execute(
        select(
            GoalEntry.goal_id,
            GoalEntry.entry_date,
            GoalEntry.value,
            GoalEntry.note,
        ).where(
            GoalEntry.goal_id.in_(goal_ids),
            GoalEntry.entry_date >= date_from,
            GoalEntry.entry_date <= date_to,
        )
    )

    entries_by_goal: dict[UUID, dict[date, GoalEntryDay]] = defaultdict(dict)

    for goal_id, entry_date, value, note in result.all():
        entries_by_goal[goal_id][entry_date] = GoalEntryDay(
            value=float(value),
            note=note,
        )

    return entries_by_goal


def get_goal_created_date(goal: Goal) -> date:
    created_at = goal.created_at

    if created_at.tzinfo is None:
        return created_at.date()

    return created_at.astimezone(WARSAW_TIMEZONE).date()


def calculate_period_current_value(
    goal_entries: dict[date, GoalEntryDay], period: GoalPeriod, reference_date: date
) -> float:
    period_start, _ = get_period_bounds(
        period,
        reference_date,
    )

    return sum(
        entry.value
        for entry_day, entry in goal_entries.items()
        if period_start <= entry_day <= reference_date
    )


async def load_goal_day_states(
    session: AsyncSession,
    owner_id: UUID,
    reference_date: date,
) -> list[GoalDayState]:
    goals = await load_active_goals(
        session=session,
        owner_id=owner_id,
    )

    applicable_goals = [
        goal for goal in goals if get_goal_created_date(goal) <= reference_date
    ]

    if not applicable_goals:
        return []

    earliest_date = reference_date

    for goal in applicable_goals:
        period_start, _ = get_period_bounds(
            goal.period,
            reference_date,
        )

        earliest_date = min(
            earliest_date,
            period_start,
        )
    goal_ids = [goal.id for goal in applicable_goals]

    entries_by_goal = await load_entries_by_goal(
        session=session,
        goal_ids=goal_ids,
        date_from=earliest_date,
        date_to=reference_date,
    )

    return build_goal_day_states(
        goals=applicable_goals,
        entries_by_goal=entries_by_goal,
        reference_date=reference_date,
    )


def build_goal_day_states(
    goals: list[Goal],
    entries_by_goal: dict[UUID, dict[date, GoalEntryDay]],
    reference_date: date,
) -> list[GoalDayState]:
    applicable_goals = [
        goal for goal in goals if get_goal_created_date(goal) <= reference_date
    ]

    states: list[GoalDayState] = []

    for goal in applicable_goals:
        goal_entries = entries_by_goal.get(
            goal.id,
            {},
        )

        day_entry = goal_entries.get(reference_date)

        period_current_value = calculate_period_current_value(
            goal_entries=goal_entries,
            period=goal.period,
            reference_date=reference_date,
        )

        states.append(
            GoalDayState(
                goal=goal,
                entry_exists=day_entry is not None,
                entry_value=(day_entry.value if day_entry is not None else 0.0),
                entry_note=(day_entry.note if day_entry is not None else None),
                period_current_value=period_current_value,
            )
        )

    return states


async def calculate_daily_progress(
    session: AsyncSession,
    owner_id: UUID,
    reference_date: date,
) -> dict[str, Any]:
    today = get_warsaw_today()

    if reference_date > today:
        raise ValueError("date cannot be in the future")

    goal_states = await load_goal_day_states(
        session=session,
        owner_id=owner_id,
        reference_date=reference_date,
    )

    return build_daily_progress(
        goal_states=goal_states,
        reference_date=reference_date,
        today=today,
    )


def build_daily_progress(
    goal_states: list[GoalDayState],
    reference_date: date,
    today: date,
) -> dict[str, Any]:
    is_day_final = reference_date < today

    if not goal_states:
        return {
            "date": reference_date,
            "timezone": TIMEZONE_NAME,
            "daily_score": None,
            "is_final": is_day_final,
            "scored_components_count": 0,
            "pending_components_count": 0,
            "components": [],
            "periodic_progress": [],
        }

    components: list[dict[str, Any]] = []
    periodic_progress: list[dict[str, Any]] = []
    component_scores: list[float] = []
    pending_components_count = 0

    for state in goal_states:
        goal = state.goal
        entry_exists = state.entry_exists
        entry_value = state.entry_value
        period_current_value = state.period_current_value

        period_start, period_end = get_period_bounds(
            goal.period,
            reference_date,
        )

        is_period_final = period_end < today

        base_component = {
            "goal_id": goal.id,
            "name": goal.name,
            "unit": goal.unit,
            "period": goal.period,
            "target_type": goal.target_type,
            "target_value": float(goal.target_value),
        }

        # ------------------------------------------------------------
        # DAILY GOALS
        # ------------------------------------------------------------
        if goal.period == GoalPeriod.DAILY:
            if goal.target_type == GoalTargetType.MIN:
                result = calculate_daily_min_result(
                    entry_exists=entry_exists,
                    entry_value=entry_value,
                    target_value=float(goal.target_value),
                    is_day_final=is_day_final,
                )
            else:
                result = calculate_daily_max_result(
                    entry_exists=entry_exists,
                    entry_value=entry_value,
                    target_value=float(goal.target_value),
                    is_day_final=is_day_final,
                )

            current_value = entry_value if entry_exists else 0.0
            components.append(
                {
                    **base_component,
                    "current_value": current_value,
                    "score": (
                        round(result.score, 2) if result.score is not None else None
                    ),
                    "status": result.status,
                    "included_in_daily_score": result.included_in_daily_score,
                    "is_period_limit_penalty": False,
                }
            )

            if result.included_in_daily_score:
                component_scores.append(result.score or 0.0)
            else:
                pending_components_count += 1

            continue

        # ------------------------------------------------------------
        # WEEKLY / MONTHLY GOALS
        # ------------------------------------------------------------
        if goal.target_type == GoalTargetType.MIN:
            period_score = calculate_min_score(
                current_value=period_current_value,
                target_value=float(goal.target_value),
            )

            if period_current_value >= float(goal.target_value):
                period_status = ProgressStatus.ACHIEVED
            elif is_period_final and period_current_value == 0:
                period_status = ProgressStatus.MISSED
            elif is_period_final:
                period_status = ProgressStatus.PARTIALLY_ACHIEVED
            else:
                period_status = ProgressStatus.IN_PROGRESS

            progress_percent: float | None = round(period_score, 2)
            limit_usage_percent: float | None = None
            caused_daily_penalty = False

        else:
            period_score = calculate_max_score(
                current_value=period_current_value,
                target_value=float(goal.target_value),
            )
            period_result = calculate_daily_max_result(
                entry_exists=True,
                entry_value=period_current_value,
                target_value=float(goal.target_value),
                is_day_final=is_period_final,
            )
            period_status = period_result.status

            progress_percent = None
            limit_usage_percent = round(
                calculate_limit_usage_percent(
                    current_value=period_current_value,
                    target_value=float(goal.target_value),
                ),
                2,
            )

            total_before_day = period_current_value - entry_value
            caused_daily_penalty = causes_period_max_daily_penalty(
                entry_value_for_day=entry_value,
                total_before_day=total_before_day,
                target_value=float(goal.target_value),
            )

            if caused_daily_penalty:
                components.append(
                    {
                        **base_component,
                        "current_value": period_current_value,
                        "score": 0.0,
                        "status": ProgressStatus.EXCEEDED,
                        "included_in_daily_score": True,
                        "is_period_limit_penalty": True,
                    }
                )
                component_scores.append(0.0)

        periodic_progress.append(
            {
                **base_component,
                "period_start": period_start,
                "period_end": period_end,
                "current_value": round(period_current_value, 2),
                "progress_percent": progress_percent,
                "limit_usage_percent": limit_usage_percent,
                "status": period_status,
                "is_final": is_period_final,
                "caused_daily_penalty": caused_daily_penalty,
            }
        )

    daily_score = None

    if component_scores:
        daily_score = round(
            sum(component_scores) / len(component_scores),
            2,
        )

    return {
        "date": reference_date,
        "timezone": TIMEZONE_NAME,
        "daily_score": daily_score,
        "is_final": is_day_final,
        "scored_components_count": len(component_scores),
        "pending_components_count": pending_components_count,
        "components": components,
        "periodic_progress": periodic_progress,
    }


async def get_goal_entries_for_date(
    session: AsyncSession,
    owner_id: UUID,
    reference_date: date,
) -> list[GoalEntryDayResponse]:
    goal_states = await load_goal_day_states(
        session=session,
        owner_id=owner_id,
        reference_date=reference_date,
    )

    return [
        GoalEntryDayResponse(
            goal_id=state.goal.id,
            name=state.goal.name,
            icon=state.goal.icon,
            color=state.goal.color,
            period=state.goal.period,
            target_type=state.goal.target_type,
            target_value=float(state.goal.target_value),
            unit=state.goal.unit,
            entry_value=(state.entry_value if state.entry_exists else None),
            period_value=round(
                state.period_current_value,
                2,
            ),
            note=state.entry_note,
        )
        for state in goal_states
    ]


def get_weekly_item_status(
    score: float | None,
    is_week_final: bool,
) -> ProgressStatus:
    if not is_week_final:
        return ProgressStatus.IN_PROGRESS

    if score == 100:
        return ProgressStatus.ACHIEVED

    if score == 0:
        return ProgressStatus.MISSED

    return ProgressStatus.PARTIALLY_ACHIEVED


def get_weekly_max_status(
    current_value: float,
    target_value: float,
    is_week_final: bool,
) -> ProgressStatus:
    if current_value > target_value:
        return ProgressStatus.EXCEEDED

    if is_week_final:
        return ProgressStatus.ACHIEVED

    return ProgressStatus.IN_PROGRESS


def iter_dates(
    start_date: date,
    end_date: date,
) -> list[date]:
    days: list[date] = []
    current_date = start_date

    while current_date <= end_date:
        days.append(current_date)
        current_date += timedelta(days=1)

    return days


async def calculate_weekly_progress(
    session: AsyncSession,
    owner_id: UUID,
    reference_date: date,
) -> dict[str, Any]:
    today = get_warsaw_today()

    if reference_date > today:
        raise ValueError("date cannot be in the future")

    week_start, week_end = get_period_bounds(
        GoalPeriod.WEEKLY,
        reference_date,
    )

    is_week_final = week_end < today
    calculation_end = week_end if is_week_final else reference_date

    goals = await load_active_goals(
        session=session,
        owner_id=owner_id,
    )

    # Monthly goals do not participate in weekly progress yet.
    applicable_goals = [
        goal
        for goal in goals
        if goal.period
        in {
            GoalPeriod.DAILY,
            GoalPeriod.WEEKLY,
        }
        and get_goal_created_date(goal) <= calculation_end
    ]

    entries_by_goal: dict[UUID, dict[date, GoalEntryDay]] = {}

    if applicable_goals:
        entries_by_goal = await load_entries_by_goal(
            session=session,
            goal_ids=[goal.id for goal in applicable_goals],
            date_from=week_start,
            date_to=calculation_end,
        )

    return build_weekly_progress(
        goals=applicable_goals,
        entries_by_goal=entries_by_goal,
        reference_date=reference_date,
        today=today,
    )


def build_weekly_progress(
    goals: list[Goal],
    entries_by_goal: dict[UUID, dict[date, GoalEntryDay]],
    reference_date: date,
    today: date,
) -> dict[str, Any]:
    week_start, week_end = get_period_bounds(
        GoalPeriod.WEEKLY,
        reference_date,
    )

    is_week_final = week_end < today
    calculation_end = week_end if is_week_final else reference_date

    # Monthly goals do not participate in weekly progress yet.
    applicable_goals = [
        goal
        for goal in goals
        if goal.period
        in {
            GoalPeriod.DAILY,
            GoalPeriod.WEEKLY,
        }
        and get_goal_created_date(goal) <= calculation_end
    ]

    if not applicable_goals:
        return {
            "date": reference_date,
            "timezone": TIMEZONE_NAME,
            "period_start": week_start,
            "period_end": week_end,
            "is_final": is_week_final,
            "weekly_score": None,
            "items": [],
        }

    items: list[dict[str, Any]] = []
    final_goal_scores: list[float] = []

    for goal in applicable_goals:
        goal_entries = entries_by_goal.get(
            goal.id,
            {},
        )

        goal_created_date = get_goal_created_date(goal)

        # Goal utworzony w środku tygodnia nie jest oceniany
        # za dni przed jego powstaniem.
        goal_start_date = max(
            week_start,
            goal_created_date,
        )

        base_item = {
            "goal_id": goal.id,
            "name": goal.name,
            "unit": goal.unit,
            "period": goal.period,
            "target_type": goal.target_type,
            "target_value": float(goal.target_value),
        }

        # ----------------------------------------------------------
        # DAILY GOALS
        # ----------------------------------------------------------
        if goal.period == GoalPeriod.DAILY:
            daily_scores: list[float] = []

            for current_day in iter_dates(
                goal_start_date,
                calculation_end,
            ):
                entry_exists = current_day in goal_entries
                entry_value = goal_entries[current_day].value if entry_exists else 0.0

                is_day_final = current_day < today

                if goal.target_type == GoalTargetType.MIN:
                    result = calculate_daily_min_result(
                        entry_exists=entry_exists,
                        entry_value=entry_value,
                        target_value=float(goal.target_value),
                        is_day_final=is_day_final,
                    )
                else:
                    result = calculate_daily_max_result(
                        entry_exists=entry_exists,
                        entry_value=entry_value,
                        target_value=float(goal.target_value),
                        is_day_final=is_day_final,
                    )

                # Dzisiejszy daily-min bez wpisu ma score None/pending,
                # więc nie zaniża jeszcze średniej tygodnia w toku.
                if result.score is not None:
                    daily_scores.append(result.score)

            daily_average_score = calculate_average_score(daily_scores)

            # Daily goal wpływa na finalny weekly_score dopiero,
            # gdy cały tydzień jest zamknięty.
            final_score = daily_average_score if is_week_final else None

            if final_score is not None:
                final_goal_scores.append(final_score)

            items.append(
                {
                    **base_item,
                    "days_counted": len(daily_scores),
                    "daily_average_score": daily_average_score,
                    "current_value": None,
                    "progress_percent": None,
                    "limit_usage_percent": None,
                    "score": final_score,
                    "status": get_weekly_item_status(
                        score=final_score,
                        is_week_final=is_week_final,
                    ),
                    "included_in_weekly_score": (final_score is not None),
                }
            )
            continue

        # ----------------------------------------------------------
        # WEEKLY GOALS
        # ----------------------------------------------------------
        weekly_current_value = sum(
            entry.value
            for entry_day, entry in goal_entries.items()
            if goal_start_date <= entry_day <= calculation_end
        )

        period_score = calculate_period_score(
            target_type=goal.target_type,
            current_value=weekly_current_value,
            target_value=float(goal.target_value),
        )

        final_score = period_score if is_week_final else None

        if final_score is not None:
            final_goal_scores.append(final_score)

        if goal.target_type == GoalTargetType.MIN:
            status = get_weekly_item_status(
                score=final_score,
                is_week_final=is_week_final,
            )
            progress_percent = period_score
            limit_usage_percent = None
        else:
            status = get_weekly_max_status(
                current_value=weekly_current_value,
                target_value=float(goal.target_value),
                is_week_final=is_week_final,
            )
            progress_percent = None
            limit_usage_percent = calculate_limit_usage_percent(
                current_value=weekly_current_value,
                target_value=float(goal.target_value),
            )

        items.append(
            {
                **base_item,
                "days_counted": None,
                "daily_average_score": None,
                "current_value": round(
                    weekly_current_value,
                    2,
                ),
                "progress_percent": (
                    round(progress_percent, 2) if progress_percent is not None else None
                ),
                "limit_usage_percent": (
                    round(limit_usage_percent, 2)
                    if limit_usage_percent is not None
                    else None
                ),
                "score": (round(final_score, 2) if final_score is not None else None),
                "status": status,
                "included_in_weekly_score": (final_score is not None),
            }
        )

    weekly_score = calculate_weekly_score(
        goal_scores=final_goal_scores,
        is_week_final=is_week_final,
    )

    return {
        "date": reference_date,
        "timezone": TIMEZONE_NAME,
        "period_start": week_start,
        "period_end": week_end,
        "is_final": is_week_final,
        "weekly_score": weekly_score,
        "items": items,
    }


def is_end_of_week(reference_date: date) -> bool:
    return reference_date.weekday() == 6  # Sunday


async def calculate_progress_range(
    session: AsyncSession,
    owner_id: UUID,
    date_from: date,
    date_to: date,
) -> list[dict[str, Any]]:
    """
    Liczy daily_progress dla każdego dnia z [date_from, date_to]
    oraz weekly_progress dla dni będących końcem tygodnia (niedziela).

    Robi to w dwóch zapytaniach do bazy (cele + wpisy dla całego
    potrzebnego zakresu), zamiast N zapytań per dzień.
    """
    today = get_warsaw_today()

    if date_from > date_to:
        raise ValueError("date_from cannot be after date_to")

    if date_to > today:
        raise ValueError("date cannot be in the future")

    goals = await load_active_goals(
        session=session,
        owner_id=owner_id,
    )

    if not goals:
        return [
            {
                **build_daily_progress(
                    goal_states=[],
                    reference_date=day,
                    today=today,
                ),
                "weekly_progress": None,
            }
            for day in iter_dates(date_from, date_to)
        ]

    # Najwcześniejsza data, jakiej mogą potrzebować okresy (weekly/monthly)
    # obejmujące date_from, np. początek tygodnia/miesiąca zawierającego d1.
    earliest_needed = date_from

    for goal in goals:
        period_start, _ = get_period_bounds(goal.period, date_from)
        earliest_needed = min(earliest_needed, period_start)

    entries_by_goal = await load_entries_by_goal(
        session=session,
        goal_ids=[goal.id for goal in goals],
        date_from=earliest_needed,
        date_to=date_to,
    )

    results: list[dict[str, Any]] = []

    for day in iter_dates(date_from, date_to):
        goal_states = build_goal_day_states(
            goals=goals,
            entries_by_goal=entries_by_goal,
            reference_date=day,
        )

        day_progress = build_daily_progress(
            goal_states=goal_states,
            reference_date=day,
            today=today,
        )

        weekly_progress = None

        if is_end_of_week(day):
            weekly_progress = build_weekly_progress(
                goals=goals,
                entries_by_goal=entries_by_goal,
                reference_date=day,
                today=today,
            )

        results.append(
            {
                **day_progress,
                "weekly_progress": weekly_progress,
            }
        )

    return results
