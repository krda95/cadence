import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from openai import APIConnectionError
from pydantic import ValidationError

import app.services.ai_chat_service as ai_service
from app.services.ai_chat_service import (
    SaveTodayEntryArguments,
    build_entry_confirmation,
    generate_ai_response,
)


def make_function_call(goal_id, operation, value):
    arguments = json.dumps(
        {
            "goal_id": str(goal_id),
            "operation": operation,
            "value": value,
        }
    )

    return SimpleNamespace(
        type="function_call",
        name="save_today_entry",
        arguments=arguments,
        call_id="call_123",
        model_dump=lambda **kwargs: {
            "type": "function_call",
            "name": "save_today_entry",
            "arguments": arguments,
            "call_id": "call_123",
        },
    )


def make_ai_response(output=None, output_text=""):
    return SimpleNamespace(
        output=output or [],
        output_text=output_text,
    )


def test_save_entry_arguments_accepts_valid_set():
    goal_id = uuid4()

    arguments = SaveTodayEntryArguments(
        goal_id=goal_id,
        operation="set",
        value=3000,
    )

    assert arguments.goal_id == goal_id
    assert arguments.operation == "set"
    assert arguments.value == 3000


def test_save_entry_arguments_accepts_valid_increment():
    arguments = SaveTodayEntryArguments(
        goal_id=uuid4(),
        operation="increment",
        value=1500,
    )

    assert arguments.operation == "increment"
    assert arguments.value == 1500


@pytest.mark.parametrize(
    "value",
    [-1, float("nan"), float("inf"), float("-inf")],
)
def test_save_entry_arguments_rejects_invalid_values(value):
    with pytest.raises(ValidationError):
        SaveTodayEntryArguments(
            goal_id=uuid4(),
            operation="set",
            value=value,
        )


def test_save_entry_arguments_rejects_invalid_operation():
    with pytest.raises(ValidationError):
        SaveTodayEntryArguments(
            goal_id=uuid4(),
            operation="delete",
            value=100,
        )


def test_save_entry_arguments_rejects_invalid_goal_id():
    with pytest.raises(ValidationError):
        SaveTodayEntryArguments(
            goal_id="invalid-uuid",
            operation="set",
            value=100,
        )


def test_build_entry_confirmation_for_set():
    result = build_entry_confirmation(
        goal_name="Steps",
        operation="set",
        value=3000,
        current_value=3000,
    )

    assert result == "Updated Steps to 3000 for today."


def test_build_entry_confirmation_for_increment():
    result = build_entry_confirmation(
        goal_name="Steps",
        operation="increment",
        value=1500,
        current_value=4500,
    )

    assert result == ("Added 1500 to Steps. Your total for today is now 4500.")


def test_build_entry_confirmation_formats_decimal_values():
    result = build_entry_confirmation(
        goal_name="Water",
        operation="increment",
        value=0.5,
        current_value=2.5,
    )

    assert result == ("Added 0.5 to Water. Your total for today is now 2.5.")


@pytest.mark.asyncio
async def test_generate_ai_response_without_function_call(monkeypatch):
    mock_client = MagicMock()

    mock_client.responses.create = AsyncMock(
        return_value=make_ai_response(output_text="You are tracking Steps and Water.")
    )

    monkeypatch.setattr(
        ai_service,
        "AsyncOpenAI",
        lambda **kwargs: mock_client,
    )

    context = {
        "goals": [
            {
                "id": str(uuid4()),
                "name": "Steps",
            },
            {
                "id": str(uuid4()),
                "name": "Water",
            },
        ]
    }

    result = await generate_ai_response(
        message="What goals am I currently tracking?",
        context=context,
        session=MagicMock(),
        owner_id=uuid4(),
    )

    assert result == "You are tracking Steps and Water."

    mock_client.responses.create.assert_awaited_once()


@pytest.mark.asyncio
async def test_generate_ai_response_set_entry(monkeypatch):
    goal_id = uuid4()
    owner_id = uuid4()

    function_call = make_function_call(
        goal_id=goal_id,
        operation="set",
        value=3000,
    )

    first_response = make_ai_response(output=[function_call])

    second_response = make_ai_response(
        output_text="Your Steps goal has been updated to 3000."
    )

    mock_client = MagicMock()

    mock_client.responses.create = AsyncMock(
        side_effect=[
            first_response,
            second_response,
        ]
    )

    mock_save = AsyncMock(
        return_value=SimpleNamespace(
            id=uuid4(),
            value=3000,
        )
    )

    monkeypatch.setattr(
        ai_service,
        "AsyncOpenAI",
        lambda **kwargs: mock_client,
    )

    monkeypatch.setattr(
        ai_service,
        "save_today_entry",
        mock_save,
    )

    context = {
        "goals": [
            {
                "id": str(goal_id),
                "name": "Steps",
            }
        ]
    }

    session = MagicMock()

    result = await generate_ai_response(
        message="Set my Steps goal to 3000",
        context=context,
        session=session,
        owner_id=owner_id,
    )

    assert result == "Your Steps goal has been updated to 3000."

    mock_save.assert_awaited_once()

    kwargs = mock_save.await_args.kwargs

    assert kwargs["goal_id"] == goal_id
    assert kwargs["owner_id"] == owner_id
    assert kwargs["session"] is session

    assert kwargs["payload"].operation == "set"
    assert kwargs["payload"].value == 3000

    assert mock_client.responses.create.await_count == 2


@pytest.mark.asyncio
async def test_generate_ai_response_increment_entry(monkeypatch):
    goal_id = uuid4()

    function_call = make_function_call(
        goal_id=goal_id,
        operation="increment",
        value=1500,
    )

    mock_client = MagicMock()

    mock_client.responses.create = AsyncMock(
        side_effect=[
            make_ai_response(output=[function_call]),
            make_ai_response(output_text="Added 1500 steps. Your total is now 4500."),
        ]
    )

    mock_save = AsyncMock(
        return_value=SimpleNamespace(
            id=uuid4(),
            value=4500,
        )
    )

    monkeypatch.setattr(
        ai_service,
        "AsyncOpenAI",
        lambda **kwargs: mock_client,
    )

    monkeypatch.setattr(
        ai_service,
        "save_today_entry",
        mock_save,
    )

    result = await generate_ai_response(
        message="Add another 1500 steps",
        context={
            "goals": [
                {
                    "id": str(goal_id),
                    "name": "Steps",
                }
            ]
        },
        session=MagicMock(),
        owner_id=uuid4(),
    )

    assert result == "Added 1500 steps. Your total is now 4500."

    mock_save.assert_awaited_once()

    payload = mock_save.await_args.kwargs["payload"]

    assert payload.operation == "increment"
    assert payload.value == 1500


@pytest.mark.asyncio
async def test_generate_ai_response_rejects_unknown_goal(monkeypatch):
    valid_goal_id = uuid4()
    invalid_goal_id = uuid4()

    function_call = make_function_call(
        goal_id=invalid_goal_id,
        operation="set",
        value=3000,
    )

    mock_client = MagicMock()

    mock_client.responses.create = AsyncMock(
        return_value=make_ai_response(output=[function_call])
    )

    mock_save = AsyncMock()

    monkeypatch.setattr(
        ai_service,
        "AsyncOpenAI",
        lambda **kwargs: mock_client,
    )

    monkeypatch.setattr(
        ai_service,
        "save_today_entry",
        mock_save,
    )

    with pytest.raises(ValueError):
        await generate_ai_response(
            message="Update my goal",
            context={
                "goals": [
                    {
                        "id": str(valid_goal_id),
                        "name": "Steps",
                    }
                ]
            },
            session=MagicMock(),
            owner_id=uuid4(),
        )

    mock_save.assert_not_awaited()


@pytest.mark.asyncio
async def test_generate_ai_response_fallback(monkeypatch):
    goal_id = uuid4()

    function_call = make_function_call(
        goal_id=goal_id,
        operation="increment",
        value=1500,
    )

    mock_client = MagicMock()

    mock_client.responses.create = AsyncMock(
        side_effect=[
            make_ai_response(output=[function_call]),
            APIConnectionError(request=MagicMock()),
        ]
    )

    mock_save = AsyncMock(
        return_value=SimpleNamespace(
            id=uuid4(),
            value=4500,
        )
    )

    monkeypatch.setattr(
        ai_service,
        "AsyncOpenAI",
        lambda **kwargs: mock_client,
    )

    monkeypatch.setattr(
        ai_service,
        "save_today_entry",
        mock_save,
    )

    result = await generate_ai_response(
        message="Add 1500 steps",
        context={
            "goals": [
                {
                    "id": str(goal_id),
                    "name": "Steps",
                }
            ]
        },
        session=MagicMock(),
        owner_id=uuid4(),
    )

    assert result == ("Added 1500 to Steps. Your total for today is now 4500.")

    mock_save.assert_awaited_once()

    assert mock_client.responses.create.await_count == 2
