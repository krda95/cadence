from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ChallengeEntryUpsert(BaseModel):
    value: float = Field(ge=0)
    note: str | None = Field(default=None, max_length=200)


class ChallengeEntryNoteUpdate(BaseModel):
    note: str | None = Field(max_length=200)


class ChallengeEntryUpdate(BaseModel):
    value: float | None = Field(default=None, ge=0)
    note: str | None = Field(default=None, max_length=200)


class ChallengeEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    challenge_id: UUID
    entry_date: date
    value: float
    note: str | None
    created_at: datetime
    updated_at: datetime
