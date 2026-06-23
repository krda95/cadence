from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ChallengePeriod, ChallengeTargetType


class ChallengeCreate(BaseModel):
    name: str = Field(max_length=100)
    icon: str | None = Field(default=None, max_length=10)
    unit: str = Field(max_length=30)
    period: ChallengePeriod
    target_type: ChallengeTargetType
    target_value: float
    is_active: bool = True


class ChallengeUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    icon: str | None = Field(default=None, max_length=10)
    unit: str | None = Field(default=None, max_length=30)
    period: ChallengePeriod | None = None
    target_type: ChallengeTargetType | None = None
    target_value: float | None = None
    is_active: bool | None = None


class ChallengeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    owner_id: UUID
    name: str
    icon: str | None
    unit: str
    period: ChallengePeriod
    target_type: ChallengeTargetType
    target_value: float
    is_active: bool
    created_at: datetime
