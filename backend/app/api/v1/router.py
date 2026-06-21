from fastapi import APIRouter

from app.api.v1.users import router as users_router


router = APIRouter()

router.include_router(users_router)


@router.get("/status", tags=["System"])
async def api_status() -> dict[str, str]:
    return {
        "status": "ok",
        "api_version": "v1",
    }