from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import GoalPeriod, GoalTargetType


class GoalEntryUpsert(BaseModel):
    value: float = Field(ge=0)
    note: str | None = Field(default=None, max_length=200)


class GoalEntryNoteUpdate(BaseModel):
    note: str | None = Field(max_length=200)


class GoalEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    goal_id: UUID
    entry_date: date
    value: float
    note: str | None
    created_at: datetime
    updated_at: datetime

class GoalEntryDayResponse(BaseModel):
    goal_id: UUID
    name: str
    icon: str | None
    color: str | None
    period: GoalPeriod
    target_type: GoalTargetType
    target_value: float
    unit: str | None

    entry_value: float | None
    period_value: float
    note: str | None