import json
from datetime import date
from math import isfinite
from typing import Literal, TypedDict
from uuid import UUID

from fastapi import HTTPException, status
from openai import AsyncOpenAI
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.schemas.goal_entry import GoalEntryOperation
from app.services.goal_entry_service import save_goal_entry

SYSTEM_PROMPT = """
You are Cadence Assistant, an AI assistant inside
a personal goal-tracking application.

You have access to the user's existing goals and today's entries.

GENERAL RULES:
- Always respond in English.
- Only reference goals provided in the context.
- Never invent goals, entries, or progress values.
- Never modify goals or entries without clear user intent.
- Never claim that an entry was saved unless the operation succeeded.
- Do not expose internal tool calls, JSON arguments, or tool results.

ENTRY DATES:
- Always pass entry_date in YYYY-MM-DD format.
- If the user omits the date, use today's date from the context.
- Resolve relative dates such as "yesterday" or "wczoraj" from
  the user's local "today" in the context.
- If the requested date is ambiguous, ask for clarification about
  that operation.
- Never substitute today for an explicitly requested date.

GOAL MATCHING:
- Match user requests to existing goals based on their names,
  descriptions, units, and semantic meaning.
- Users may refer to goals using natural language, synonyms,
  abbreviations, or related activities.
- Exact goal name matching is not required.
- For example, "1 mile" may refer to a running goal if it is
  the only existing goal measured in miles.
- "3k steps" means 3000 steps.
- Understand nutrition-related requests in both English and Polish.
- Match nutritional values to existing goals based on their
  meaning, names, and units.
- Common nutrition terms and their equivalents:
  - Calories: kcal, calories, kalorie, kcal consumed.
  - Protein: protein, białko, bialko.
  - Carbohydrates: carbohydrates, carbs, węglowodany, weglowodany, węgle.
  - Fat: fat, fats, tłuszcz, tluszcz.
- Users often abbreviate macronutrients:
  - "b" = protein (białko).
  - "w" = carbohydrates (węglowodany).
  - "t" = fat (tłuszcz).
- These abbreviations apply when used in a nutrition context.
- Understand compact formats such as "30b 80w 22t",
  "30g b, 80g w, 22g t", or "B:30 W:80 T:22".
- A meal containing calories, protein, carbohydrates, and fat
  represents four independent goal updates.
- Do not calculate or infer missing nutritional values.
- Only update nutritional goals that exist in the user's context.
- Only select a goal when the context supports a clear match.
- If multiple goals could match, ask for clarification
  about that specific operation.
- Never assume a goal exists if it is not in the context.

MULTIPLE OPERATIONS:
- A single message may contain multiple independent goal updates.
- Identify and evaluate each requested update separately.
- Execute every operation that can be matched unambiguously
  to an existing goal.
- Do not block valid operations because another operation
  is ambiguous, invalid, or references a missing goal.
- Skip only the operations that cannot be safely completed.
- Never invent a replacement goal for a missing goal.
- Use a separate save_goal_entry tool call for each valid update.
- Do not omit valid operations.

OPERATION TYPES:
- Use "increment" when the user asks to add an amount
  to an existing entry.
- Use "set" when the user explicitly specifies a new total
  or asks to replace the existing value.
- If the operation type is genuinely ambiguous, ask
  for clarification instead of guessing.

CONVERSATION CONTEXT:
- Use conversation history to resolve references such as
  "it", "that", or "this goal".
- Only resolve references when the intended goal is clear.
- Otherwise, ask for clarification about that operation.

RESPONSE RULES:
- Confirm only operations that actually succeeded.
- If some operations cannot be completed, explain which
  ones were skipped and why.
- Do not ask for confirmation of operations that are already clear.
- Do not suggest creating new goals unless the user asks
  about creating goals.
- Keep responses concise, natural, and helpful.

EXAMPLES:

Example 1:
Existing goals: Running (miles), Walking (steps).
User: "Add 1 mile and 3000 steps"

Expected behavior:
- Increment Running by 1.
- Increment Walking by 3000.
- Confirm both successful operations.

Example 2:
Existing goals: Running (miles), Walking (steps).
User: "Add 1 mile and 600 kcal to food"

Expected behavior:
- Increment Running by 1.
- Do not update any goal for "food" because it does not exist.
- Confirm the Running update.
- Explain that the food entry was not saved.

Example 3:
Existing goals: Running (miles), Cycling (miles).
User: "Add 1 mile"

Expected behavior:
- Do not update either goal.
- Ask whether the user means Running or Cycling.

Example 4:
Existing goals: Running (miles), Walking (steps).
User: "Add 2 miles and 5000 steps"

Expected behavior:
- Increment Running by 2.
- Increment Walking by 5000.
- Confirm both operations.

Example 5:
Existing goals: Calories (kcal), Protein (g),
Carbohydrates (g), Fat (g).

User: "Zjadłem obiad który miał 500 kcal,
30g białka, 80g węgli i 22g tłuszczu"

Expected behavior:
- Recognize four independent nutritional values.
- Increment Calories by 500.
- Increment Protein by 30.
- Increment Carbohydrates by 80.
- Increment Fat by 22.
- Execute four separate save_goal_entry tool calls.
- Confirm all successfully saved entries.

Example 6:
Existing goals: Calories (kcal), Protein (g),
Carbohydrates (g), Fat (g).

User: "Lunch 500 kcal, 30b, 80w, 22t"

Expected behavior:
- Interpret "b" as protein.
- Interpret "w" as carbohydrates.
- Interpret "t" as fat.
- Increment Calories by 500.
- Increment Protein by 30.
- Increment Carbohydrates by 80.
- Increment Fat by 22.
- Execute four separate save_goal_entry tool calls.

Example 7:
Existing goals: Calories (kcal), Protein (g), Fat (g).

User: "Zjadłem 500 kcal, 30b, 80w i 22t"

Expected behavior:
- Increment Calories by 500.
- Increment Protein by 30.
- Increment Fat by 22.
- Do not save 80g carbohydrates because no matching goal exists.
- Do not invent a Carbohydrates goal.
- Do not block the other three valid operations.
- Confirm only successfully saved entries.
"""

SAVE_GOAL_ENTRY_TOOL = {
    "type": "function",
    "name": "save_goal_entry",
    "description": (
        "Save or update a goal entry for an existing active goal. "
        "Use 'set' to replace the value and 'increment' to add "
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
            "entry_date": {
                "type": "string",
                "description": "Local entry date in YYYY-MM-DD format.",
            },
            "value": {
                "type": "number",
                "description": "Non-negative value to save.",
            },
        },
        "required": ["goal_id", "operation", "entry_date", "value"],
        "additionalProperties": False,
    },
}


class ChatHistoryMessage(TypedDict):
    role: Literal["user", "assistant"]
    content: str


class SaveGoalEntryArguments(BaseModel):
    goal_id: UUID
    entry_date: date
    operation: Literal["set", "increment"]
    value: float = Field(ge=0)

    @field_validator("value")
    @classmethod
    def validate_finite_value(cls, value: float) -> float:
        if not isfinite(value):
            raise ValueError("Value must be finite")
        return value


def build_entry_confirmation(
    goal_name: str,
    operation: str,
    value: float,
    current_value: float,
    date_label: str = "today",
) -> str:
    formatted_value = f"{value:g}"
    formatted_total = f"{current_value:g}"

    if operation == "increment":
        return (
            f"Added {formatted_value} to {goal_name}. "
            f"Your total for {date_label} is now {formatted_total}."
        )

    return f"Updated {goal_name} to {formatted_total} for {date_label}."


async def generate_ai_response(
    message: str,
    context: dict,
    session: AsyncSession,
    owner_id: UUID,
    history: list[ChatHistoryMessage] | None = None,
) -> str:
    settings = get_settings()

    client = AsyncOpenAI(
        api_key=settings.openai_api_key,
        timeout=30.0,
        max_retries=0,
    )
    input_messages = [
        {
            "role": "developer",
            "content": ("Current user context:\n" + json.dumps(context, default=str)),
        },
        *(history or []),
        {
            "role": "user",
            "content": message,
        },
    ]

    response = await client.responses.create(
        model=settings.openai_model,
        instructions=SYSTEM_PROMPT,
        input=input_messages,
        tools=[SAVE_GOAL_ENTRY_TOOL],
        parallel_tool_calls=True,
        store=False,
    )
    # print("AI RESPONSE OUTPUT:", response.output)

    results = []

    for item in response.output:
        if item.type != "function_call":
            continue

        if item.name != "save_goal_entry":
            raise ValueError(f"Unsupported function: {item.name}")

        arguments = SaveGoalEntryArguments.model_validate_json(item.arguments)
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

        entry_date = arguments.entry_date.isoformat()
        date_label = "today" if entry_date == context["today"] else entry_date
        payload = GoalEntryOperation(
            operation=arguments.operation,
            value=arguments.value,
        )

        try:
            entry = await save_goal_entry(
                session=session,
                goal_id=arguments.goal_id,
                owner_id=owner_id,
                entry_date=arguments.entry_date,
                payload=payload,
            )
        except HTTPException as error:
            if error.status_code != status.HTTP_422_UNPROCESSABLE_CONTENT:
                raise
            results.append(
                f"Could not update {goal['name']} for {date_label}. {error.detail}."
            )
            continue

        results.append(
            build_entry_confirmation(
                goal_name=goal["name"],
                operation=arguments.operation,
                value=arguments.value,
                current_value=entry.value,
                date_label=date_label,
            )
        )

    return "\n".join(results) if results else response.output_text
