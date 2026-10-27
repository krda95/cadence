export interface DashboardTodayResponse {
  score: number | null;
  scored_components_count: number;
  pending_components_count: number;
}

export interface DashboardWeekResponse {
  score: number | null;
  days_count: number;
}

export interface DashboardStreakResponse {
  current: number;
  longest: number;
}

export interface DashboardResponse {
  today: DashboardTodayResponse;
  week: DashboardWeekResponse;
  previous_week: DashboardWeekResponse;
  streak: DashboardStreakResponse;
}
