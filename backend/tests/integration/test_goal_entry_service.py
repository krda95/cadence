import asyncio
import os
import uuid

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.enums import GoalPeriod, GoalTargetType
from app.models.goal import Goal
from app.models.goal_entry import GoalEntry
from app.schemas.goal_entry import GoalEntryOperation
from app.services.goal_entry_service import save_today_entry

pytestmark = [
    pytest.mark.integration,
    pytest.mark.asyncio(loop_scope="session"),
]

TEST_OWNER_ID = os.getenv("CADENCE_TEST_USER_ID")

if not TEST_OWNER_ID:
    pytest.skip(
        "Set CADENCE_TEST_USER_ID before running integration tests.",
        allow_module_level=True,
    )


@pytest_asyncio.fixture(loop_scope="session")
async def test_goal():
    goal_id = uuid.uuid4()
    owner_id = uuid.UUID(TEST_OWNER_ID)

    async with AsyncSessionLocal() as session:
        goal = Goal(
            id=goal_id,
            owner_id=owner_id,
            name=f"[AI TEST] {goal_id.hex[:8]}",
            unit="steps",
            period=GoalPeriod.DAILY,
            target_type=GoalTargetType.MIN,
            target_value=10000,
            is_active=True,
            position=999,
        )

        session.add(goal)
        await session.commit()

    try:
        yield goal_id, owner_id
    finally:
        async with AsyncSessionLocal() as session:
            goal = await session.get(Goal, goal_id)

            if goal:
                await session.delete(goal)
                await session.commit()


@pytest.mark.parametrize(
    "operations, expected",
    [
        ([("set", 5000)], 5000),
        ([("set", 5000), ("set", 8000)], 8000),
        ([("set", 5000), ("increment", 2000)], 7000),
        ([("increment", 2000)], 2000),
        ([("set", 0)], 0),
    ],
)
async def test_save_today_entry(
    test_goal,
    operations,
    expected,
):
    goal_id, owner_id = test_goal

    async with AsyncSessionLocal() as session:
        for operation, value in operations:
            entry = await save_today_entry(
                session=session,
                goal_id=goal_id,
                owner_id=owner_id,
                payload=GoalEntryOperation(
                    operation=operation,
                    value=value,
                ),
            )

        assert entry.value == expected

        result = await session.execute(
            select(GoalEntry).where(
                GoalEntry.goal_id == goal_id,
            )
        )

        entries = result.scalars().all()

        assert len(entries) == 1
        assert entries[0].value == expected


async def test_cannot_update_inactive_goal(test_goal):
    goal_id, owner_id = test_goal

    async with AsyncSessionLocal() as session:
        goal = await session.get(Goal, goal_id)
        goal.is_active = False
        await session.commit()

    async with AsyncSessionLocal() as session:
        with pytest.raises(HTTPException) as error:
            await save_today_entry(
                session=session,
                goal_id=goal_id,
                owner_id=owner_id,
                payload=GoalEntryOperation(
                    operation="set",
                    value=5000,
                ),
            )

        assert error.value.status_code == 422


async def test_cannot_update_other_users_goal(test_goal):
    goal_id, _ = test_goal

    other_user_id = uuid.uuid4()

    async with AsyncSessionLocal() as session:
        with pytest.raises(HTTPException) as error:
            await save_today_entry(
                session=session,
                goal_id=goal_id,
                owner_id=other_user_id,
                payload=GoalEntryOperation(
                    operation="set",
                    value=5000,
                ),
            )

        assert error.value.status_code == 404


async def test_concurrent_increments(test_goal):
    goal_id, owner_id = test_goal

    async def increment():
        async with AsyncSessionLocal() as session:
            return await save_today_entry(
                session=session,
                goal_id=goal_id,
                owner_id=owner_id,
                payload=GoalEntryOperation(
                    operation="increment",
                    value=1000,
                ),
            )

    await asyncio.gather(
        increment(),
        increment(),
    )

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(GoalEntry).where(
                GoalEntry.goal_id == goal_id,
            )
        )

        entry = result.scalar_one()

        assert entry.value == 2000
