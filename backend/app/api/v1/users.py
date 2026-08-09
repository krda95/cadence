from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.dependencies.auth import CurrentUser, get_current_user
from app.models.profile import Profile
from app.schemas.profile import ProfileResponse


router = APIRouter(tags=["Users"])


@router.get("/me", response_model=ProfileResponse)
async def get_my_profile(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> Profile:
    result = await session.execute(
        select(Profile).where(Profile.id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    print("current user", current_user)

    if profile is None:
        profile = Profile(id=current_user.id, display_name=current_user.username)
        session.add(profile)
        await session.commit()
        await session.refresh(profile)

    return ProfileResponse(
        id=profile.id,
        email=current_user.email,
        display_name=profile.display_name,
        avatar_url=profile.avatar_url,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )