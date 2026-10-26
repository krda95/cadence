import json
from math import isfinite
from typing import Literal
from uuid import UUID

from openai import AsyncOpenAI
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.schemas.goal_entry import GoalEntryOperation
from app.services.goal_entry_service import save_today_entry

SYSTEM_PROMPT = """
You are Cadence Assistant, an AI assistant inside
a personal goal-tracking application.

You have access to the user's current goals and today's entries.

Rules:
- Always respond in English.
- Only reference goals provided in the context.
- Never invent goals, entries, or progress values.
- If the user's request is ambiguous, ask for clarification.
- You may save or update today's goal entries using available tools.
- Never claim that an entry was saved unless the operation succeeded.
- Never modify goals or entries without clear user intent.
"""

SAVE_TODAY_ENTRY_TOOL = {
    "type": "function",
    "name": "save_today_entry",
    "description": (
        "Save or update today's entry for an existing active goal. "
        "Use 'set' to replace today's value and 'increment' to add "
        "to the existing value. "
        "Only call this function when the user's intent is clear."
    ),
    "strict": True,
    "parameters": {
        "type": "object",
        "properties": {
            "goal_id": {
                "type": "string",
                "description": "UUID of the goal from the provided context.",
            },
            "operation": {
                "type": "string",
                "enum": ["set", "increment"],
            },
            "value": {
                "type": "number",
                "description": "Non-negative value to save.",
            },
        },
        "required": ["goal_id", "operation", "value"],
        "additionalProperties": False,
    },
}


class SaveTodayEntryArguments(BaseModel):
    goal_id: UUID
    operation: Literal["set", "increment"]
    value: float = Field(ge=0)

    @field_validator("value")
    @classmethod
    def validate_finite_value(cls, value: float) -> float:
        if not isfinite(value):
            raise ValueError("Value must be finite")
        return value


async def generate_ai_response(
    message: str,
    context: dict,
    session: AsyncSession,
    owner_id: UUID,
) -> str:
    settings = get_settings()

    client = AsyncOpenAI(
        api_key=settings.openai_api_key,
        timeout=30.0,
        max_retries=0,
    )

    response = await client.responses.create(
        model=settings.openai_model,
        instructions=SYSTEM_PROMPT,
        input=[
            {
                "role": "developer",
                "content": (
                    "Current user context:\n" + json.dumps(context, default=str)
                ),
            },
            {
                "role": "user",
                "content": message,
            },
        ],
        tools=[SAVE_TODAY_ENTRY_TOOL],
        parallel_tool_calls=False,
        store=False,
    )
    print("AI RESPONSE OUTPUT:", response.output)
    for item in response.output:
        if item.type != "function_call":
            continue

        if item.name != "save_today_entry":
            raise ValueError(f"Unsupported function: {item.name}")

        arguments = SaveTodayEntryArguments.model_validate_json(item.arguments)

        goal = next(
            (
                goal
                for goal in context["goals"]
                if UUID(str(goal["id"])) == arguments.goal_id
            ),
            None,
        )

        if goal is None:
            raise ValueError(
                "The requested goal is not available in the user's context."
            )

        print("Validated function call:", arguments)
        print("Matched goal:", goal["name"])
        payload = GoalEntryOperation(
            operation=arguments.operation, value=arguments.value
        )

        entry = await save_today_entry(
            session=session,
            goal_id=arguments.goal_id,
            owner_id=owner_id,
            payload=payload,
        )

        print("AI ENTRY SAVED:", entry.id)
        print("NEW VALUE:", entry.value)

    return response.output_text
