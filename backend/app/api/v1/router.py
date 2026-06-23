from fastapi import APIRouter

from app.api.v1.users import router as users_router
from app.api.v1.challenges import router as challenges_router


router = APIRouter()

router.include_router(users_router)
router.include_router(challenges_router)


@router.get("/status", tags=["System"])
async def api_status() -> dict[str, str]:
    return {
        "status": "ok",
        "api_version": "v1",
    }