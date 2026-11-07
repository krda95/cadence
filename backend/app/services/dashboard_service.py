from calendar import monthrange
from datetime import date, timedelta
from typing import Literal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timezone import get_request_timezone
from app.models.goal import Goal
from app.schemas.dashboard import DashboardResponse
from app.services.progress_service import (
    build_daily_progress,
    calculate_progress_range,
    get_user_today,
)


def get_activity_period_bounds(
    today: date,
    first_goal_date: date | None,
    period: Literal["week", "month"],
    offset: int,
) -> tuple[date, date, int]:
    if offset < 0:
        raise ValueError("offset cannot be negative")

    if period == "week":
        current_start = today - timedelta(days=today.weekday())

        period_start = current_start - timedelta(weeks=offset)
        period_end = period_start + timedelta(days=6)

        if first_goal_date is not None:
            first_week_start = first_goal_date - timedelta(
                days=first_goal_date.weekday()
            )
            max_offset = (current_start - first_week_start).days // 7
        else:
            max_offset = 0

    elif period == "month":
        current_month_index = today.year * 12 + today.month - 1
        selected_month_index = current_month_index - offset

        year, month_index = divmod(selected_month_index, 12)
        month = month_index + 1

        period_start = date(year, month, 1)
        period_end = date(year, month, monthrange(year, month)[1])

        if first_goal_date is not None:
            first_month_index = first_goal_date.year * 12 + first_goal_date.month - 1
            max_offset = current_month_index - first_month_index
        else:
            max_offset = 0

    else:
        raise ValueError(f"Unsupported activity period: {period}")

    max_offset = max(0, max_offset)

    if offset > max_offset:
        raise ValueError("offset exceeds available history")

    return period_start, period_end, max_offset


def build_activity_data(
    history: list[dict],
    date_from: date,
    date_to: date,
) -> list[dict]:
    scores_by_date = {
        day["date"]: day["daily_score"]
        for day in history
        if date_from <= day["date"] <= date_to
    }

    activity_data = []
    current_date = date_from

    while current_date <= date_to:
        activity_data.append(
            {
                "date": current_date,
                "score": scores_by_date.get(current_date),
            }
        )

        current_date += timedelta(days=1)

    return activity_data


async def get_dashboard(
    session: AsyncSession,
    owner_id: UUID,
    period: Literal["week", "month"] = "week",
    offset: int = 0,
) -> DashboardResponse:
    today = get_user_today()
    week_start = today - timedelta(days=today.weekday())
    previous_week_start = week_start - timedelta(days=7)
    previous_week_end = week_start - timedelta(days=1)
    weekly_scores: list[float] = []
    weekly_score: float | None = None
    history: list[dict] = []

    first_goal_date = await get_first_goal_date(
        session=session,
        owner_id=owner_id,
    )

    activity_date_from, activity_date_to, max_offset = get_activity_period_bounds(
        today=today,
        first_goal_date=first_goal_date,
        period=period,
        offset=offset,
    )

    if first_goal_date is not None and first_goal_date <= today:
        history = await calculate_progress_range(
            session=session,
            owner_id=owner_id,
            date_from=first_goal_date,
            date_to=today,
        )

        daily_progress = history[-1]

    else:
        daily_progress = build_daily_progress(
            goal_states=[],
            reference_date=today,
            today=today,
        )
    completed_history = [day for day in history if day["date"] < today]

    current_streak, longest_streak = calculate_streaks(completed_history)
    weekly_scores = [
        day["daily_score"]
        for day in completed_history
        if day["date"] >= week_start and day["daily_score"] is not None
    ]

    weekly_score = (
        round(sum(weekly_scores) / len(weekly_scores), 2) if weekly_scores else None
    )

    previous_weekly_scores = [
        day["daily_score"]
        for day in completed_history
        if previous_week_start <= day["date"] <= previous_week_end
        and day["daily_score"] is not None
    ]

    previous_weekly_score = (
        round(sum(previous_weekly_scores) / len(previous_weekly_scores), 2)
        if previous_weekly_scores
        else None
    )

    activity_data = build_activity_data(
        history=history,
        date_from=activity_date_from,
        date_to=activity_date_to,
    )

    return {
        "today": {
            "score": daily_progress["daily_score"],
            "scored_components_count": daily_progress["scored_components_count"],
            "pending_components_count": daily_progress["pending_components_count"],
        },
        "week": {
            "score": weekly_score,
            "days_count": len(weekly_scores),
        },
        "previous_week": {
            "score": previous_weekly_score,
            "days_count": len(previous_weekly_scores),
        },
        "streak": {
            "current": current_streak,
            "longest": longest_streak,
        },
        "activity": {
            "period": period,
            "offset": offset,
            "date_from": activity_date_from,
            "date_to": activity_date_to,
            "min_offset": 0,
            "max_offset": max_offset,
            "data": activity_data,
        },
    }


async def get_first_goal_date(
    session: AsyncSession,
    owner_id: UUID,
) -> date | None:
    created_at = await session.scalar(
        select(func.min(Goal.created_at)).where(
            Goal.owner_id == owner_id,
            Goal.is_active.is_(True),
        )
    )

    if created_at is None:
        return None

    if created_at.tzinfo is None:
        return created_at.date()

    return created_at.astimezone(get_request_timezone()).date()


def calculate_streaks(
    daily_progress: list[dict],
    great_threshold: float = 90,
) -> tuple[int, int]:
    current_streak = 0
    longest_streak = 0
    running_streak = 0

    for day in daily_progress:
        score = day["daily_score"]

        if score is not None and score > great_threshold:
            running_streak += 1
        else:
            running_streak = 0

        longest_streak = max(longest_streak, running_streak)

    current_streak = running_streak

    return current_streak, longest_streak
