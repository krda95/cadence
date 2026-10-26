from fastapi import APIRouter, Depends, HTTPException, status
from openai import APIConnectionError, APIStatusError, APITimeoutError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.dependencies.auth import CurrentUser, get_current_user
from app.schemas.ai_chat import AIChatRequest, AIChatResponse
from app.services.ai_chat_service import generate_ai_response
from app.services.ai_context_service import get_ai_user_context

router = APIRouter(
    prefix="/ai",
    tags=["AI Assistant"],
)


@router.post("/chat", response_model=AIChatResponse)
async def chat(
    payload: AIChatRequest,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> AIChatResponse:
    context = await get_ai_user_context(
        session=session,
        owner_id=current_user.id,
    )

    try:
        message = await generate_ai_response(
            message=payload.message,
            context=context,
            session=session,
            owner_id=current_user.id,
            history=[item.model_dump() for item in payload.history],
        )

    except APITimeoutError as error:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="AI service timed out",
        ) from error

    except APIConnectionError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is temporarily unavailable",
        ) from error

    except APIStatusError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service returned an error",
        ) from error

    return AIChatResponse(message=message)
