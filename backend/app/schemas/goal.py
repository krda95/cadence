from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import GoalPeriod, GoalTargetType, GoalTargetType


class GoalCreate(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=100,
        examples=["Reduction summer 2026"],
    )
    icon: str | None = Field(default=None, max_length=10)
    unit: str = Field(min_length=1, max_length=30)
    period: GoalPeriod
    target_type: GoalTargetType
    target_value: float = Field(ge=0)
    is_active: bool = True


class GoalUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    icon: str | None = Field(default=None, max_length=10)
    unit: str | None = Field(default=None, min_length=1, max_length=30)
    period: GoalPeriod | None = None
    target_type: GoalTargetType | None = None
    target_value: float | None = Field(default=None, ge=0)
    is_active: bool | None = None


class GoalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    owner_id: UUID
    name: str
    icon: str | None
    unit: str
    period: GoalPeriod
    target_type: GoalTargetType
    target_value: float
    is_active: bool
    created_at: datetime
    updated_at: datetime
