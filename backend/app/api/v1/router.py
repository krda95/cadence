from fastapi import APIRouter


router = APIRouter()


@router.get("/status", tags=["System"])
async def api_status() -> dict[str, str]:
    return {
        "status": "ok",
        "api_version": "v1",
    }