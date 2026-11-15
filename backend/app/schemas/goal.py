from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import GoalPeriod, GoalTargetType


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
    is_active: bool = True

    @model_validator(mode="after")
    def validate_target(self) -> Self:
        validate_goal_target(
            target_type=self.target_type,
            target_value=self.target_value,
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
