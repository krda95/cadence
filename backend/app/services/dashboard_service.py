from datetime import timedelta
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.dashboard import DashboardResponse
from app.services.progress_service import (
    calculate_daily_progress,
    calculate_progress_range,
    get_warsaw_today,
)


async def get_dashboard(
    session: AsyncSession,
    owner_id: UUID,
) -> DashboardResponse:
    today = get_warsaw_today()
    week_start = today - timedelta(days=today.weekday())
    week_end = today - timedelta(days=1)
    weekly_scores: list[float] = []
    weekly_score = 0.0

    daily_progress = await calculate_daily_progress(
        session=session,
        owner_id=owner_id,
        reference_date=today,
    )
    if week_start <= week_end:
        week_progress = await calculate_progress_range(
            session=session,
            owner_id=owner_id,
            date_from=week_start,
            date_to=week_end,
        )

        weekly_scores = [
            day["daily_score"]
            for day in week_progress
            if day["daily_score"] is not None
        ]

        weekly_score = round(sum(weekly_scores) / len(weekly_scores), 2)

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
    }
