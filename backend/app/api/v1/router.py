from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router
from app.api.v1.goals import router as goals_router
from app.api.v1.dashboard import router as dashboard_router


router = APIRouter()

router.include_router(auth_router)
router.include_router(users_router)
router.include_router(goals_router)
router.include_router(dashboard_router)


@router.get("/status", tags=["System"])
async def api_status() -> dict[str, str]:
    return {
        "status": "ok",
        "api_version": "v1",
    }
