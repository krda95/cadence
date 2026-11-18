from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import GoalPeriod, GoalQuickActionType, GoalTargetType


class GoalCreate(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=100,
        examples=["Reduction summer 2026"],
    )
    icon: str | None = Field(default=None, max_length=50)
    color: str | None = Field(default=None, max_length=7)
    unit: str = Field(min_length=1, max_length=30)
    period: GoalPeriod
    target_type: GoalTargetType
    target_value: float = Field(ge=0)
    quick_action_type: GoalQuickActionType = GoalQuickActionType.NONE
    quick_action_step: float | None = Field(default=None, gt=0)

    is_active: bool = True

    @model_validator(mode="after")
    def validate_target(self) -> Self:
        validate_goal_target(
            target_type=self.target_type,
            target_value=self.target_value,
        )
        validate_goal_quick_action(
            period=self.period,
            target_type=self.target_type,
            quick_action_type=self.quick_action_type,
            quick_action_step=self.quick_action_step,
        )
        return self


class GoalUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    icon: str | None = Field(default=None, max_length=50)
    color: str | None = Field(default=None, max_length=7)
    unit: str | None = Field(default=None, min_length=1, max_length=30)
    period: GoalPeriod | None = None
    target_type: GoalTargetType | None = None
    target_value: float | None = Field(default=None, ge=0)
    quick_action_type: GoalQuickActionType | None = None
    quick_action_step: float | None = Field(default=None, gt=0)

    is_active: bool | None = None


class GoalReorderRequest(BaseModel):
    goal_ids: list[UUID]


class GoalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    owner_id: UUID
    name: str
    icon: str | None
    color: str | None
    unit: str
    period: GoalPeriod
    target_type: GoalTargetType
    target_value: float
    quick_action_type: GoalQuickActionType
    quick_action_step: float | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    position: int


def validate_goal_target(
    target_type: GoalTargetType,
    target_value: float,
) -> None:
    if target_type == GoalTargetType.MIN and target_value <= 0:
        raise ValueError("Minimum goal target must be greater than zero")


def validate_goal_quick_action(
    period: GoalPeriod,
    target_type: GoalTargetType,
    quick_action_type: GoalQuickActionType,
    quick_action_step: float | None,
) -> None:
    if quick_action_type == GoalQuickActionType.NONE:
        return

    if quick_action_type == GoalQuickActionType.CHECK:
        if period == GoalPeriod.DAILY and target_type == GoalTargetType.MIN:
            return
        raise ValueError("Completion toggle is available only for daily min goals")

    if quick_action_type == GoalQuickActionType.INCREMENT and (
        quick_action_step is None or quick_action_step <= 0
    ):
        raise ValueError("Increment quick action requires a step greater than zero")
