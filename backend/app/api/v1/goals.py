from datetime import date
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.dependencies.auth import CurrentUser, get_current_user
from app.models.goal import Goal, GoalPeriod
from app.models.goal_entry import GoalEntry
from app.schemas.goal_entry import (
    GoalEntryDayResponse,
    GoalEntryResponse,
    GoalEntryNoteUpdate,
    GoalEntryUpsert,
)
from app.schemas.goal import (
    GoalCreate,
    GoalResponse,
    GoalUpdate,
)
from app.schemas.progress import DailyProgressResponse, DayProgressResponse, WeeklyProgressResponse
from app.services.progress_service import (
    calculate_daily_progress,
    calculate_progress_range,
    calculate_weekly_progress,
    get_goal_entries_for_date,
    get_warsaw_today,
)



router = APIRouter(
    prefix="/goals",
    tags=["Goals"],
)


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


@router.post(
    "",
    response_model=GoalResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_goal(
    payload: GoalCreate,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> Goal:
    goal = Goal(
        owner_id=current_user.id,
        name=payload.name,
        icon=payload.icon,
        color=payload.color,
        unit=payload.unit,
        period=payload.period,
        target_type=payload.target_type,
        target_value=payload.target_value,
        is_active=payload.is_active,
    )

    session.add(goal)
    await session.commit()
    await session.refresh(goal)

    return goal


@router.get(
    "",
    response_model=list[GoalResponse],
)
async def list_my_goals(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[Goal]:
    result = await session.execute(
        select(Goal)
        .where(Goal.owner_id == current_user.id)
        .order_by(Goal.created_at.desc())
    )

    return list(result.scalars().all())

@router.get(
    "/progress/daily",
    response_model=DailyProgressResponse,
)
async def get_daily_progress(
    progress_date: date | None = Query(
        default=None,
        alias="date",
    ),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> DailyProgressResponse:
    try:
        progress = await calculate_daily_progress(
            session=session,
            owner_id=current_user.id,
            reference_date=progress_date or get_warsaw_today(),
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(error),
        ) from error

    return DailyProgressResponse(**progress)

@router.get(
    "/progress/weekly",
    response_model=WeeklyProgressResponse,
)
async def get_weekly_progress(
    progress_date: date | None = Query(
        default=None,
        alias="date",
    ),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> WeeklyProgressResponse:
    try:
        progress = await calculate_weekly_progress(
            session=session,
            owner_id=current_user.id,
            reference_date=progress_date or get_warsaw_today(),
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(error),
        ) from error

    return WeeklyProgressResponse(**progress)

@router.get(
    "/progress/range",
    response_model=list[DayProgressResponse],
)
async def get_progress_range(
    date_from: date,
    date_to: date,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[DayProgressResponse]:
    if date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="date_from cannot be after date_to",
        )

    try:
        progress_days = await calculate_progress_range(
            session=session,
            owner_id=current_user.id,
            date_from=date_from,
            date_to=date_to,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(error),
        ) from error

    return [
        DayProgressResponse(**day_progress)
        for day_progress in progress_days
    ]

@router.get(
    "/entries",
    response_model=list[GoalEntryDayResponse],
)
async def get_entries_for_date(
    date: date,
    session: AsyncSession = Depends(get_db_session),
    current_user: CurrentUser = Depends(get_current_user)
):
    return await get_goal_entries_for_date(
        session=session,
        owner_id=current_user.id,
        reference_date=date
    )

@router.get(
    "/{goal_id}",
    response_model=GoalResponse,
)
async def get_my_goal(
    goal_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> Goal:
    return await get_owned_goal_or_404(
        goal_id=goal_id,
        owner_id=current_user.id,
        session=session,
    )


@router.patch(
    "/{goal_id}",
    response_model=GoalResponse,
)
async def update_my_goal(
    goal_id: uuid.UUID,
    payload: GoalUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> Goal:
    goal = await get_owned_goal_or_404(
        goal_id=goal_id,
        owner_id=current_user.id,
        session=session,
    )

    update_data = payload.model_dump(exclude_unset=True)

    for field_name, value in update_data.items():
        setattr(goal, field_name, value)

    await session.commit()
    await session.refresh(goal)

    return goal


@router.delete(
    "/{goal_id}",
    response_model=GoalResponse,
)
async def archive_my_goal(
    goal_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> Goal:
    goal = await get_owned_goal_or_404(
        goal_id=goal_id,
        owner_id=current_user.id,
        session=session,
    )

    goal.is_active = False

    await session.commit()
    await session.refresh(goal)

    return goal


@router.put(
    "/{goal_id}/entries/{entry_date}",
    response_model=GoalEntryResponse,
)
async def upsert_goal_entry(
    goal_id: uuid.UUID,
    entry_date: date,
    payload: GoalEntryUpsert,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> GoalEntry:
    await get_owned_goal_or_404(
        goal_id=goal_id,
        owner_id=current_user.id,
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


@router.patch(
    "/{goal_id}/entries/{entry_date}/note",
    response_model=GoalEntryResponse,
)
async def update_goal_entry_note(
    goal_id: uuid.UUID,
    entry_date: date,
    payload: GoalEntryNoteUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> GoalEntry:
    await get_owned_goal_or_404(
        goal_id=goal_id,
        owner_id=current_user.id,
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal entry not found",
        )

    entry.note = payload.note

    await session.commit()
    await session.refresh(entry)

    return entry


@router.get(
    "/{goal_id}/entries",
    response_model=list[GoalEntryResponse],
)
async def list_goal_entries(
    goal_id: uuid.UUID,
    date_from: date,
    date_to: date,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[GoalEntry]:
    if date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="date_from cannot be later than date_to",
        )

    await get_owned_goal_or_404(
        goal_id=goal_id,
        owner_id=current_user.id,
        session=session,
    )

    result = await session.execute(
        select(GoalEntry)
        .where(
            GoalEntry.goal_id == goal_id,
            GoalEntry.entry_date >= date_from,
            GoalEntry.entry_date <= date_to,
        )
        .order_by(GoalEntry.entry_date.asc())
    )

    return list(result.scalars().all())


@router.delete(
    "/{goal_id}/entries/{entry_date}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_goal_entry(
    goal_id: uuid.UUID,
    entry_date: date,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    await get_owned_goal_or_404(
        goal_id=goal_id,
        owner_id=current_user.id,
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal entry not found",
        )

    await session.delete(entry)
    await session.commit()
