import { GoalPeriod, GoalTargetType } from './goalModel';

export type ProgressStatus =
  'pending' | 'in_progress' | 'partially_achieved' | 'achieved' | 'exceeded' | 'missed';

export interface DailyScoreComponent {
  goal_id: string;
  name: string;
  unit: string;
  period: GoalPeriod;
  target_type: GoalTargetType;
  target_value: number;
  current_value: number;
  score: number | null;
  status: ProgressStatus;
  included_in_daily_score: boolean;
  is_period_limit_penalty: boolean;
}

export interface PeriodProgressItem {
  goal_id: string;
  name: string;
  unit: string;
  period: GoalPeriod;
  target_type: GoalTargetType;
  target_value: number;
  period_start: string;
  period_end: string;
  current_value: number;
  progress_percent: number | null;
  limit_usage_percent: number | null;
  status: ProgressStatus;
  is_final: boolean;
  caused_daily_penalty: boolean;
}

export interface DailyProgressResponse {
  date: string;
  timezone: string;
  daily_score: number | null;
  is_final: boolean;
  scored_components_count: number;
  pending_components_count: number;
  components: DailyScoreComponent[];
  periodic_progress: PeriodProgressItem[];
}

export interface WeeklyProgressItem {
  goal_id: string;
  name: string;
  unit: string;
  period: GoalPeriod;
  target_type: GoalTargetType;
  target_value: number;
  days_counted: number | null;
  daily_average_score: number | null;
  current_value: number | null;
  progress_percent: number | null;
  limit_usage_percent: number | null;
  score: number | null;
  status: ProgressStatus;
  included_in_weekly_score: boolean;
}

export interface WeeklyProgressResponse {
  date: string;
  timezone: string;
  period_start: string;
  period_end: string;
  is_final: boolean;
  weekly_score: number | null;
  items: WeeklyProgressItem[];
}

export interface DayProgressResponse {
  date: string;
  timezone: string;
  daily_score: number | null;
  is_final: boolean;
  scored_components_count: number;
  pending_components_count: number;
  components: DailyScoreComponent[];
  periodic_progress: PeriodProgressItem[];
  weekly_progress: WeeklyProgressResponse | null;
}
