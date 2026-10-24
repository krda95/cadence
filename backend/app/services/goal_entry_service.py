import uuid
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.goal import Goal
from app.models.goal_entry import GoalEntry
from app.schemas.goal_entry import GoalEntryOperation, GoalEntryUpsert
from app.services.progress_service import get_user_today


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


async def save_today_entry(
    session: AsyncSession,
    goal_id: uuid.UUID,
    owner_id: uuid.UUID,
    payload: GoalEntryOperation,
) -> GoalEntry:
    goal = await get_owned_goal_or_404(
        session=session,
        goal_id=goal_id,
        owner_id=owner_id,
    )

    if not goal.is_active:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Cannot update an inactive goal",
        )

    today = get_user_today()

    stmt = insert(GoalEntry).values(
        id=uuid.uuid4(),
        goal_id=goal_id,
        entry_date=today,
        value=payload.value,
    )

    if payload.operation == "increment":
        stmt = stmt.on_conflict_do_update(
            index_elements=[
                GoalEntry.goal_id,
                GoalEntry.entry_date,
            ],
            set_={
                "value": GoalEntry.value + stmt.excluded.value,
                "updated_at": func.now(),
            },
        )
    else:
        stmt = stmt.on_conflict_do_update(
            index_elements=[
                GoalEntry.goal_id,
                GoalEntry.entry_date,
            ],
            set_={
                "value": stmt.excluded.value,
                "updated_at": func.now(),
            },
        )

    stmt = stmt.returning(GoalEntry)

    result = await session.execute(stmt)
    entry = result.scalar_one()

    await session.commit()
    await session.refresh(entry)

    return entry
