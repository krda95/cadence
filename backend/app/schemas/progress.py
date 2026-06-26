from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import (
    ChallengePeriod,
    ChallengeTargetType,
    ProgressStatus,
)


class DailyScoreComponent(BaseModel):
    challenge_id: UUID
    name: str
    unit: str
    period: ChallengePeriod
    target_type: ChallengeTargetType
    target_value: float

    current_value: float
    score: float | None = Field(
        default=None,
        ge=0,
        le=100,
    )

    status: ProgressStatus
    included_in_daily_score: bool

    # True for weekly/monthly max
    is_period_limit_penalty: bool = False


class PeriodProgressItem(BaseModel):
    challenge_id: UUID
    name: str
    unit: str
    period: ChallengePeriod
    target_type: ChallengeTargetType
    target_value: float

    period_start: date
    period_end: date
    current_value: float

    progress_percent: float | None = Field(
        default=None,
        ge=0,
        le=100,
    )

    limit_usage_percent: float | None = Field(
        default=None,
        ge=0,
        le=100,
    )

    status: ProgressStatus
    is_final: bool

    # True for weekly/monthly max
    caused_daily_penalty: bool


class DailyProgressResponse(BaseModel):
    date: date
    timezone: str

    daily_score: float | None = Field(
        default=None,
        ge=0,
        le=100,
    )

    is_final: bool

    scored_components_count: int
    pending_components_count: int

    components: list[DailyScoreComponent]
    periodic_progress: list[PeriodProgressItem]