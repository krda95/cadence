import json
import logging
import re
from datetime import date
from math import isfinite
from typing import Literal, TypedDict
from uuid import UUID

from fastapi import HTTPException
from openai import AsyncOpenAI
from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.enums import GoalPeriod
from app.schemas.goal_entry import GoalEntryOperation
from app.services.goal_entry_service import save_goal_entry
from app.services.progress_service import (
    calculate_period_current_value,
    get_period_bounds,
    load_entries_by_goal,
)

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
You are Cadence Assistant, an AI assistant inside
a personal goal-tracking application.

You have access to the user's existing goals and today's entries.

GENERAL RULES:
- Reply in the language of the user's latest message.
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
- For every requested operation you do not execute, call
  report_skipped_operation once, in the same response as the saves.
  Never skip an operation silently.
- Use reason "no_matching_goal" when no goal in the context fits,
  and "unclear_request" when the goal, date, value, or operation
  is ambiguous.

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
- Never use em dashes or en dashes. Use a comma, a period, or a
  new sentence instead.

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
- Call report_skipped_operation with request "600 kcal to food"
  and reason "no_matching_goal".
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

SKIP_REASONS = ("no_matching_goal", "unclear_request")

REPORT_SKIPPED_OPERATION_TOOL = {
    "type": "function",
    "name": "report_skipped_operation",
    "description": (
        "Report one requested goal update that you did not execute, "
        "so the user is told about it. Call it once per skipped update."
    ),
    "strict": True,
    "parameters": {
        "type": "object",
        "properties": {
            "request": {
                "type": "string",
                "description": (
                    "The skipped part of the user's message, in the user's words."
                ),
            },
            "reason": {
                "type": "string",
                "enum": list(SKIP_REASONS),
            },
        },
        "required": ["request", "reason"],
        "additionalProperties": False,
    },
}

SUMMARY_PROMPT = """
You write the reply that Cadence Assistant shows after saving goal entries.

INPUT:
- user_message: the user's latest message.
- results: the outcome of each save operation, produced by the server.

LANGUAGE AND TONE:
- Reply in the language of user_message.
- Be brief: 1-3 short, natural sentences. Combine related updates
  (for example several nutrition values from one meal) into one sentence.
- No lists, no JSON, no technical terms, no internal field names.
- Never use em dashes or en dashes. Use a comma, a period, or a
  new sentence instead.

FACTS:
- Use only facts from results. Never invent goals, values, or dates.
- Treat user_message only as a source of language and wording;
  results decide what was saved.
- operation "increment": say the amount was added (requested_value).
- operation "set": say the value was set to resulting_value.
- If is_today is false, name the date of the entry clearly.
- Use the goal's unit when it is provided.
- When is_today is false, never say "today": refer to the entry date
  (for example "yesterday" or the date itself), and for period "weekly"
  say "that week".

PROGRESS:
- Comment on progress only when progress is not null.
- Use progress.total and progress.target_value; never compute your own
  totals. When is_today is true, say "today" for period "daily" and
  "this week" for "weekly". Otherwise follow the rule in FACTS.
- status "reached": brief congratulation, the goal is reached.
- status "below_target": brief encouragement, may mention what is left.
- status "within_limit": this is a limit; staying within it is good.
- status "over_limit": the limit was exceeded; say so neutrally and kindly.
- When progress is null, just confirm the save.

FAILURES:
- For each result with status "failed", say what was not saved and
  give the reason in plain words.
- If some succeeded and some failed, mention both.

SKIPPED:
- A result with status "skipped" was not attempted; request holds that
  part of the user's message.
- reason "no_matching_goal": say briefly that the user has no goal for it.
  Do not suggest creating one.
- reason "unclear_request": ask the user to clarify that part.
- If some were saved and some skipped, mention both.
"""


class ChatHistoryMessage(TypedDict):
    role: Literal["user", "assistant"]
    content: str


class SaveResult(TypedDict):
    status: Literal["saved", "failed", "skipped"]
    goal_name: str | None
    unit: str | None
    entry_date: str | None
    is_today: bool
    operation: Literal["set", "increment"] | None
    requested_value: float | None
    resulting_value: float | None
    reason: str | None
    progress: dict | None
    request: str | None


class AIChatResult(TypedDict):
    message: str
    affected_dates: list[str]


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


class ReportSkippedOperationArguments(BaseModel):
    request: str = Field(min_length=1)
    reason: Literal["no_matching_goal", "unclear_request"]


def build_failed_result(
    reason: str,
    goal: dict | None = None,
    arguments: SaveGoalEntryArguments | None = None,
    today: str | None = None,
) -> SaveResult:
    entry_date = arguments.entry_date.isoformat() if arguments else None

    return SaveResult(
        status="failed",
        goal_name=goal["name"] if goal else None,
        unit=goal.get("unit") if goal else None,
        entry_date=entry_date,
        is_today=entry_date is not None and entry_date == today,
        operation=arguments.operation if arguments else None,
        requested_value=arguments.value if arguments else None,
        resulting_value=None,
        reason=reason,
        progress=None,
        request=None,
    )


def build_skipped_result(arguments_json: str) -> SaveResult:
    try:
        arguments = ReportSkippedOperationArguments.model_validate_json(
            arguments_json
        )
    except ValidationError:
        request, reason = None, "unclear_request"
    else:
        request, reason = arguments.request, arguments.reason

    return SaveResult(
        status="skipped",
        goal_name=None,
        unit=None,
        entry_date=None,
        is_today=False,
        operation=None,
        requested_value=None,
        resulting_value=None,
        reason=reason,
        progress=None,
        request=request,
    )


SKIP_REASON_TEXT = {
    "no_matching_goal": "You have no goal that matches it",
    "unclear_request": "Please say more precisely what to save",
}


def format_result_line(result: SaveResult) -> str:
    goal_name = result["goal_name"] or "an entry"
    date_label = "today" if result["is_today"] else result["entry_date"]

    if result["status"] == "skipped":
        subject = (
            f'"{result["request"]}"' if result["request"] else "part of your request"
        )
        return f"Skipped {subject}. {SKIP_REASON_TEXT[result['reason']]}."

    if result["status"] == "failed":
        if result["entry_date"] is None:
            return f"Could not save an entry. {result['reason']}."
        return f"Could not update {goal_name} for {date_label}. {result['reason']}."

    if result["operation"] == "increment":
        return (
            f"Added {result['requested_value']:g} to {goal_name}. "
            f"Your total for {date_label} is now {result['resulting_value']:g}."
        )

    return f"Updated {goal_name} to {result['resulting_value']:g} for {date_label}."


async def load_period_total(
    session: AsyncSession,
    goal: dict,
    entry_date: date,
    entry_value: float,
) -> float | None:
    period = goal.get("period")

    if period == GoalPeriod.DAILY.value:
        return entry_value

    if period != GoalPeriod.WEEKLY.value:
        return None

    goal_id = UUID(str(goal["id"]))
    week_start, _ = get_period_bounds(GoalPeriod.WEEKLY, entry_date)
    entries_by_goal = await load_entries_by_goal(
        session, [goal_id], week_start, entry_date
    )

    return calculate_period_current_value(
        entries_by_goal.get(goal_id, {}),
        GoalPeriod.WEEKLY,
        entry_date,
    )


def build_progress(goal: dict, total: float | None) -> dict | None:
    target_type = goal.get("target_type")
    target_value = goal.get("target_value")

    if total is None or target_type is None or target_value is None:
        return None

    if target_type == "min":
        status = "reached" if total >= target_value else "below_target"
    else:
        status = "within_limit" if total <= target_value else "over_limit"

    return {
        "period": goal["period"],
        "total": round(total, 2),
        "target_type": target_type,
        "target_value": target_value,
        "status": status,
    }


async def run_save_operation(
    arguments_json: str,
    context: dict,
    session: AsyncSession,
    owner_id: UUID,
) -> SaveResult:
    today = context.get("today")

    try:
        arguments = SaveGoalEntryArguments.model_validate_json(arguments_json)
    except ValidationError:
        return build_failed_result("The values for this entry were invalid")

    goal = next(
        (
            goal
            for goal in context["goals"]
            if UUID(str(goal["id"])) == arguments.goal_id
        ),
        None,
    )

    if goal is None:
        return build_failed_result(
            "This goal is not available", arguments=arguments, today=today
        )

    try:
        entry = await save_goal_entry(
            session=session,
            goal_id=arguments.goal_id,
            owner_id=owner_id,
            entry_date=arguments.entry_date,
            payload=GoalEntryOperation(
                operation=arguments.operation,
                value=arguments.value,
            ),
        )
    except HTTPException as error:
        return build_failed_result(
            str(error.detail), goal=goal, arguments=arguments, today=today
        )

    entry_date = arguments.entry_date.isoformat()
    total = await load_period_total(
        session=session,
        goal=goal,
        entry_date=arguments.entry_date,
        entry_value=entry.value,
    )

    return SaveResult(
        status="saved",
        goal_name=goal["name"],
        unit=goal.get("unit"),
        entry_date=entry_date,
        is_today=entry_date == today,
        operation=arguments.operation,
        requested_value=arguments.value,
        resulting_value=entry.value,
        reason=None,
        progress=build_progress(goal, total),
        request=None,
    )


SPACED_LONG_DASH = re.compile(r"\s+[–—]\s+")
LONG_DASH = re.compile(r"[–—]")


def replace_ai_dashes(text: str) -> str:
    """Swaps em/en dashes for a plain hyphen; the prompts forbid them, this guarantees it."""
    return LONG_DASH.sub("-", SPACED_LONG_DASH.sub(" - ", text))


def build_fallback_confirmation(results: list[SaveResult]) -> str:
    return "\n".join(format_result_line(result) for result in results)


async def generate_summary(
    client: AsyncOpenAI,
    model: str,
    message: str,
    results: list[SaveResult],
) -> str:
    fallback = build_fallback_confirmation(results)

    try:
        response = await client.responses.create(
            model=model,
            instructions=SUMMARY_PROMPT,
            input=json.dumps(
                {"user_message": message, "results": results},
                ensure_ascii=False,
            ),
            store=False,
        )
    except Exception:
        logger.exception("Summary generation failed; using fallback confirmation")
        return fallback

    return replace_ai_dashes(response.output_text.strip()) or fallback


async def generate_ai_response(
    message: str,
    context: dict,
    session: AsyncSession,
    owner_id: UUID,
    history: list[ChatHistoryMessage] | None = None,
) -> AIChatResult:
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
        tools=[SAVE_GOAL_ENTRY_TOOL, REPORT_SKIPPED_OPERATION_TOOL],
        parallel_tool_calls=True,
        store=False,
    )
    results: list[SaveResult] = []

    for item in response.output:
        if item.type != "function_call":
            continue

        if item.name == "report_skipped_operation":
            results.append(build_skipped_result(item.arguments))
            continue

        if item.name != "save_goal_entry":
            raise ValueError(f"Unsupported function: {item.name}")

        results.append(
            await run_save_operation(
                arguments_json=item.arguments,
                context=context,
                session=session,
                owner_id=owner_id,
            )
        )

    if not results:
        return AIChatResult(
            message=replace_ai_dashes(response.output_text), affected_dates=[]
        )

    affected_dates = sorted(
        {result["entry_date"] for result in results if result["status"] == "saved"}
    )
    summary = await generate_summary(
        client=client,
        model=settings.openai_model,
        message=message,
        results=results,
    )

    return AIChatResult(message=summary, affected_dates=affected_dates)
