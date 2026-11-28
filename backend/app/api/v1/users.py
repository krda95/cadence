from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.dependencies.auth import CurrentUser, get_current_user
from app.models.profile import Profile
from app.schemas.profile import ProfileResponse
from app.services.avatar_service import AvatarService

router = APIRouter(tags=["Users"])


@router.get("/me", response_model=ProfileResponse)
async def get_my_profile(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> Profile:
    result = await session.execute(select(Profile).where(Profile.id == current_user.id))
    profile = result.scalar_one_or_none()

    if profile is None:
        profile = Profile(id=current_user.id, display_name=current_user.username)
        session.add(profile)
        await session.commit()
        await session.refresh(profile)

    avatar_service = AvatarService()

    avatar_url = None

    if profile.avatar_url:
        avatar_url = avatar_service.get_avatar_url(profile.avatar_url)

    return ProfileResponse(
        id=profile.id,
        email=current_user.email,
        display_name=profile.display_name,
        avatar_url=avatar_url,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
        has_password="email" in current_user.providers,
    )


@router.post("/me/avatar", response_model=ProfileResponse)
async def upload_my_avatar(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ProfileResponse:
    result = await session.execute(select(Profile).where(Profile.id == current_user.id))

    profile = result.scalar_one_or_none()

    if profile is None:
        profile = Profile(
            id=current_user.id,
            display_name=current_user.username,
        )
        session.add(profile)

    avatar_service = AvatarService()

    previous_avatar = profile.avatar_url

    new_avatar = await avatar_service.upload_avatar(
        current_user.id,
        file,
    )

    try:
        profile.avatar_url = new_avatar

        await session.commit()
        await session.refresh(profile)

    except Exception:
        await session.rollback()

        avatar_service.delete_avatar(new_avatar)

        raise

    if previous_avatar:
        try:
            avatar_service.delete_avatar(previous_avatar)
        except Exception as e:
            print(f"Failed to delete previous avatar: {previous_avatar}")
            print(f"Error: {e}")
            pass

    return ProfileResponse(
        id=profile.id,
        email=current_user.email,
        display_name=profile.display_name,
        avatar_url=profile.avatar_url,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
        has_password="email" in current_user.providers,
    )


@router.delete("/me/avatar", status_code=204)
async def delete_my_avatar(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    result = await session.execute(select(Profile).where(Profile.id == current_user.id))

    profile = result.scalar_one_or_none()

    if profile is None or not profile.avatar_url:
        return

    avatar_service = AvatarService()

    previous_avatar = profile.avatar_url

    profile.avatar_url = None

    await session.commit()

    try:
        avatar_service.delete_avatar(previous_avatar)
    except Exception:
        pass
