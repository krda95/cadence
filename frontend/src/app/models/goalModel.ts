export type GoalPeriod = 'daily' | 'weekly' | 'monthly';
export type GoalTargetType = 'min' | 'max';

export interface GoalCreate {
  name: string;
  icon: string | null;
  color: string | null;
  unit: string;
  period: GoalPeriod;
  target_type: GoalTargetType;
  target_value: number;
  is_active: boolean;
}

export interface GoalUpdate {
  name?: string;
  icon?: string | null;
  color?: string | null;
  unit?: string;
  period?: GoalPeriod;
  target_type?: GoalTargetType;
  target_value?: number;
  is_active?: boolean;
}

export interface GoalResponse {
  id: string;
  owner_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  unit: string;
  period: GoalPeriod;
  target_type: GoalTargetType;
  target_value: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GoalEntryDayResponse {
  goal_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  unit: string;
  period: GoalPeriod;
  target_type: GoalTargetType;
  target_value: number;
  entry_value: number | null;
  period_value: number;
  note: string | null;
}