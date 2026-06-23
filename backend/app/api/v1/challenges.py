import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.dependencies.auth import CurrentUser, get_current_user
from app.models.challenge import Challenge
from app.schemas.challenge import ChallengeCreate, ChallengeResponse


router = APIRouter(
    prefix="/challenges",
    tags=["Challenges"],
)


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
    result = await session.execute(
        select(Challenge).where(
            Challenge.id == challenge_id,
            Challenge.owner_id == current_user.id,
        )
    )

    challenge = result.scalar_one_or_none()

    if challenge is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Challenge not found",
        )

    return challenge