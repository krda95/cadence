import uuid
from datetime import date
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.goal import Goal
from app.models.goal_entry import GoalEntry
from app.schemas.goal_entry import GoalEntryUpsert


async def get_owned_goal_or_404(
    goal_id: uuid.UUID,
    owner_id: uuid.UUID,
    session: AsyncSession,
) -> Goal:
    result = await session.execute(
        select(Goal).where(
            Goal.id == goal_id,
            Goal.owner_id == owner_id,
        )
    )

    goal = result.scalar_one_or_none()

    if goal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found",
        )

    return goal


async def upsert_goal_entry(
    session: AsyncSession,
    goal_id: uuid.UUID,
    owner_id: uuid.UUID,
    entry_date: date,
    payload: GoalEntryUpsert,
) -> GoalEntry:
    await get_owned_goal_or_404(
        goal_id=goal_id,
        owner_id=owner_id,
        session=session,
    )

    result = await session.execute(
        select(GoalEntry).where(
            GoalEntry.goal_id == goal_id,
            GoalEntry.entry_date == entry_date,
        )
    )
    entry = result.scalar_one_or_none()

    if entry is None:
        entry = GoalEntry(
            goal_id=goal_id,
            entry_date=entry_date,
            value=payload.value,
            note=payload.note,
        )
        session.add(entry)
    else:
        entry.value = payload.value
        entry.note = payload.note

    await session.commit()
    await session.refresh(entry)

    return entry
