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


class DashboardResponse(BaseModel):
    today: DashboardTodayResponse
    week: DashboardPeriodResponse
    previous_week: DashboardPeriodResponse
    streak: DashboardStreakResponse
