export interface DashboardTodayResponse {
  score: number | null;
  scored_components_count: number;
  pending_components_count: number;
  has_entries: boolean;
}

export interface DashboardWeekResponse {
  score: number | null;
  days_count: number;
}

export interface DashboardStreakResponse {
  current: number;
  longest: number;
}

export interface DashboardActivityDayResponse {
  included_in_averages: boolean;
  date: string;
  score: number | null;
}

export interface DashboardActivityResponse {
  period: 'week' | 'month';
  offset: number;
  date_from: string;
  date_to: string;
  min_offset: number;
  max_offset: number;
  data: DashboardActivityDayResponse[];
}

export interface DashboardResponse {
  today: DashboardTodayResponse;
  week: DashboardWeekResponse;
  previous_week: DashboardWeekResponse;
  streak: DashboardStreakResponse;
  activity: DashboardActivityResponse;
}
