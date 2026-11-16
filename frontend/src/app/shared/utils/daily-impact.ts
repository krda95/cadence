import { DailyScoreComponent, PeriodProgressItem } from '@models/progressModel';

/** What the entry of a weekly goal on a given day does to that day's score. */
export interface DailyImpact {
  /** +5 / -5 pp before the threshold is crossed, otherwise 0. */
  adjustmentPp: number;
  /** 0 or 100 once the threshold is crossed (the goal counts in the average), otherwise null. */
  countedScore: number | null;
}

interface DayProgress {
  components: DailyScoreComponent[];
  periodic_progress: PeriodProgressItem[];
}

/** Maps each weekly goal of a day to its impact, using the progress the API returned for that day. */
export function buildDailyImpacts(progress: DayProgress | null): Map<string, DailyImpact> {
  const impacts = new Map<string, DailyImpact>();

  if (!progress) {
    return impacts;
  }

  // Step 1: every weekly goal starts with its bonus / penalty (0 when none applies).
  for (const item of progress.periodic_progress ?? []) {
    impacts.set(item.goal_id, { adjustmentPp: item.daily_adjustment_pp, countedScore: null });
  }

  // Step 2: weekly goals that crossed their threshold count in the average instead.
  for (const component of progress.components ?? []) {
    if (component.period !== 'weekly') {
      continue;
    }

    impacts.set(component.goal_id, { adjustmentPp: 0, countedScore: component.score });
  }

  return impacts;
}
