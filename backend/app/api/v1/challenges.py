from datetime import date
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.dependencies.auth import CurrentUser, get_current_user
from app.models.challenge import Challenge
from app.models.challenge_entry import ChallengeEntry
from app.schemas.challenge_entry import (
    ChallengeEntryNoteUpdate,
    ChallengeEntryResponse,
    ChallengeEntryUpsert,
)
from app.schemas.challenge import (
    ChallengeCreate,
    ChallengeResponse,
    ChallengeUpdate,
)


router = APIRouter(
    prefix="/challenges",
    tags=["Challenges"],
)


async def get_owned_challenge_or_404(
    challenge_id: uuid.UUID,
    owner_id: uuid.UUID,
    session: AsyncSession,
) -> Challenge:
    result = await session.execute(
        select(Challenge).where(
            Challenge.id == challenge_id,
            Challenge.owner_id == owner_id,
        )
    )

    challenge = result.scalar_one_or_none()

    if challenge is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Challenge not found",
        )

    return challenge


@router.post(
    "",
    response_model=ChallengeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_challenge(
    payload: ChallengeCreate,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> Challenge:
    challenge = Challenge(
        owner_id=current_user.id,
        name=payload.name,
        icon=payload.icon,
        unit=payload.unit,
        period=payload.period,
        target_type=payload.target_type,
        target_value=payload.target_value,
        is_active=payload.is_active,
    )

    session.add(challenge)
    await session.commit()
    await session.refresh(challenge)

    return challenge


@router.get(
    "",
    response_model=list[ChallengeResponse],
)
async def list_my_challenges(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[Challenge]:
    result = await session.execute(
        select(Challenge)
        .where(Challenge.owner_id == current_user.id)
        .order_by(Challenge.created_at.desc())
    )

    return list(result.scalars().all())


@router.get(
    "/{challenge_id}",
    response_model=ChallengeResponse,
)
async def get_my_challenge(
    challenge_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> Challenge:
    return await get_owned_challenge_or_404(
        challenge_id=challenge_id,
        owner_id=current_user.id,
        session=session,
    )


@router.patch(
    "/{challenge_id}",
    response_model=ChallengeResponse,
)
async def update_my_challenge(
    challenge_id: uuid.UUID,
    payload: ChallengeUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> Challenge:
    challenge = await get_owned_challenge_or_404(
        challenge_id=challenge_id,
        owner_id=current_user.id,
        session=session,
    )

    update_data = payload.model_dump(exclude_unset=True)

    for field_name, value in update_data.items():
        setattr(challenge, field_name, value)

    await session.commit()
    await session.refresh(challenge)

    return challenge


@router.delete(
    "/{challenge_id}",
    response_model=ChallengeResponse,
)
async def archive_my_challenge(
    challenge_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> Challenge:
    challenge = await get_owned_challenge_or_404(
        challenge_id=challenge_id,
        owner_id=current_user.id,
        session=session,
    )

    challenge.is_active = False

    await session.commit()
    await session.refresh(challenge)

    return challenge


@router.put(
    "/{challenge_id}/entries/{entry_date}",
    response_model=ChallengeEntryResponse,
)
async def upsert_challenge_entry(
    challenge_id: uuid.UUID,
    entry_date: date,
    payload: ChallengeEntryUpsert,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ChallengeEntry:
    await get_owned_challenge_or_404(
        challenge_id=challenge_id,
        owner_id=current_user.id,
        session=session,
    )

    result = await session.execute(
        select(ChallengeEntry).where(
            ChallengeEntry.challenge_id == challenge_id,
            ChallengeEntry.entry_date == entry_date,
        )
    )
    entry = result.scalar_one_or_none()

    if entry is None:
        entry = ChallengeEntry(
            challenge_id=challenge_id,
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
    "/{challenge_id}/entries/{entry_date}/note",
    response_model=ChallengeEntryResponse,
)
async def update_challenge_entry_note(
    challenge_id: uuid.UUID,
    entry_date: date,
    payload: ChallengeEntryNoteUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ChallengeEntry:
    await get_owned_challenge_or_404(
        challenge_id=challenge_id,
        owner_id=current_user.id,
        session=session,
    )

    result = await session.execute(
        select(ChallengeEntry).where(
            ChallengeEntry.challenge_id == challenge_id,
            ChallengeEntry.entry_date == entry_date,
        )
    )
    entry = result.scalar_one_or_none()

    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Challenge entry not found",
        )

    entry.note = payload.note

    await session.commit()
    await session.refresh(entry)

    return entry


@router.get(
    "/{challenge_id}/entries",
    response_model=list[ChallengeEntryResponse],
)
async def list_challenge_entries(
    challenge_id: uuid.UUID,
    date_from: date,
    date_to: date,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[ChallengeEntry]:
    if date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="date_from cannot be later than date_to",
        )

    await get_owned_challenge_or_404(
        challenge_id=challenge_id,
        owner_id=current_user.id,
        session=session,
    )

    result = await session.execute(
        select(ChallengeEntry)
        .where(
            ChallengeEntry.challenge_id == challenge_id,
            ChallengeEntry.entry_date >= date_from,
            ChallengeEntry.entry_date <= date_to,
        )
        .order_by(ChallengeEntry.entry_date.asc())
    )

    return list(result.scalars().all())


@router.delete(
    "/{challenge_id}/entries/{entry_date}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_challenge_entry(
    challenge_id: uuid.UUID,
    entry_date: date,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    await get_owned_challenge_or_404(
        challenge_id=challenge_id,
        owner_id=current_user.id,
        session=session,
    )

    result = await session.execute(
        select(ChallengeEntry).where(
            ChallengeEntry.challenge_id == challenge_id,
            ChallengeEntry.entry_date == entry_date,
        )
    )
    entry = result.scalar_one_or_none()

    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Challenge entry not found",
        )

    await session.delete(entry)
    await session.commit()
