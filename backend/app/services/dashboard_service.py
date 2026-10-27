from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timezone import get_request_timezone
from app.models.goal import Goal
from app.schemas.dashboard import DashboardResponse
from app.services.progress_service import (
    calculate_daily_progress,
    calculate_progress_range,
    get_user_today,
)


async def get_dashboard(
    session: AsyncSession,
    owner_id: UUID,
) -> DashboardResponse:
    today = get_user_today()
    week_start = today - timedelta(days=today.weekday())
    previous_week_start = week_start - timedelta(days=7)
    previous_week_end = week_start - timedelta(days=1)
    weekly_scores: list[float] = []
    weekly_score: float | None = None
    history: list[dict] = []

    daily_progress = await calculate_daily_progress(
        session=session,
        owner_id=owner_id,
        reference_date=today,
    )
    first_goal_date = await get_first_goal_date(
        session=session,
        owner_id=owner_id,
    )

    if first_goal_date is not None and first_goal_date < today:
        history = await calculate_progress_range(
            session=session,
            owner_id=owner_id,
            date_from=first_goal_date,
            date_to=today - timedelta(days=1),
        )

    current_streak, longest_streak = calculate_streaks(history)
    weekly_scores = [
        day["daily_score"]
        for day in history
        if day["date"] >= week_start and day["daily_score"] is not None
    ]

    weekly_score = (
        round(sum(weekly_scores) / len(weekly_scores), 2) if weekly_scores else None
    )

    previous_weekly_scores = [
        day["daily_score"]
        for day in history
        if previous_week_start <= day["date"] <= previous_week_end
        and day["daily_score"] is not None
    ]

    previous_weekly_score = (
        round(sum(previous_weekly_scores) / len(previous_weekly_scores), 2)
        if previous_weekly_scores
        else None
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
