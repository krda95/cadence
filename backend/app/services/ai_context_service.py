from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.goal import Goal
from app.models.goal_entry import GoalEntry
from app.services.progress_service import get_user_today


async def get_ai_user_context(
    session: AsyncSession,
    owner_id: UUID,
) -> dict:
    today = get_user_today()

    stmt = (
        select(Goal, GoalEntry)
        .outerjoin(
            GoalEntry,
            (GoalEntry.goal_id == Goal.id) & (GoalEntry.entry_date == today),
        )
        .where(
            Goal.owner_id == owner_id,
            Goal.is_active.is_(True),
        )
        .order_by(Goal.position.asc())
    )

    result = await session.execute(stmt)

    goals = []

    for goal, entry in result.all():
        goals.append(
            {
                "id": str(goal.id),
                "name": goal.name,
                "unit": goal.unit,
                "period": goal.period.value,
                "target_type": goal.target_type.value,
                "target_value": goal.target_value,
                "today_value": entry.value if entry else None,
                "has_entry_today": entry is not None,
            }
        )

    return {
        "today": today.isoformat(),
        "goals": goals,
    }
