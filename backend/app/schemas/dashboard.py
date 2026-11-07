from datetime import date
from typing import Literal

from pydantic import BaseModel


class DashboardTodayResponse(BaseModel):
    score: float | None
    scored_components_count: int
    pending_components_count: int


class DashboardPeriodResponse(BaseModel):
    score: float | None
    days_count: int


class DashboardStreakResponse(BaseModel):
    current: int
    longest: int


class DashboardActivityDayResponse(BaseModel):
    date: date
    score: float | None


class DashboardActivityResponse(BaseModel):
    period: Literal["week", "month"]
    offset: int
    date_from: date
    date_to: date
    min_offset: int
    max_offset: int
    data: list[DashboardActivityDayResponse]


class DashboardResponse(BaseModel):
    today: DashboardTodayResponse
    week: DashboardPeriodResponse
    previous_week: DashboardPeriodResponse
    streak: DashboardStreakResponse
    activity: DashboardActivityResponse
