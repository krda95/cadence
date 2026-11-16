import { buildDailyImpacts } from './daily-impact';

describe('buildDailyImpacts', () => {
  it('returns nothing without progress', () => {
    expect(buildDailyImpacts(null).size).toBe(0);
  });

  it('maps the bonus or penalty of weekly goals before their threshold', () => {
    const impacts = buildDailyImpacts({
      components: [],
      periodic_progress: [
        { goal_id: 'a', daily_adjustment_pp: 5 },
        { goal_id: 'b', daily_adjustment_pp: -5 },
      ],
    } as never);

    expect(impacts.get('a')).toEqual({ adjustmentPp: 5, countedScore: null });
    expect(impacts.get('b')).toEqual({ adjustmentPp: -5, countedScore: null });
  });

  it('marks weekly goals that count in the average and ignores daily components', () => {
    const impacts = buildDailyImpacts({
      components: [
        { goal_id: 'a', period: 'weekly', score: 0 },
        { goal_id: 'd', period: 'daily', score: 100 },
      ],
      periodic_progress: [{ goal_id: 'a', daily_adjustment_pp: 0 }],
    } as never);

    expect(impacts.get('a')).toEqual({ adjustmentPp: 0, countedScore: 0 });
    expect(impacts.has('d')).toBe(false);
  });
});
